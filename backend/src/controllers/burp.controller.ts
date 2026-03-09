import { Request, Response } from "express";
import { readEnvFile } from "../utils/envWriter";

function getBurpConnection() {
  const env = readEnvFile();
  const host = env.BURP_RPC_HOST;
  const port = parseInt(env.BURP_RPC_PORT || "50051", 10);
  return { host, port };
}

export const getBurpProxyHistory = async (req: Request, res: Response) => {
  try {
    const { host, port } = getBurpConnection();

    if (!host) {
      return res.status(400).json({
        message: "Burp RPC is not configured. Set the host and port in Settings.",
        notConfigured: true,
      });
    }

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string, 10) || 20));

    const { BurpClient, decodeBase64Body } = await import("burp-rpc");
    const burp = new BurpClient({ host, port });

    try {
      const allEntries = await burp.proxy.getHistory();
      const total = allEntries.length;

      const reversed = [...allEntries].reverse();
      const start = (page - 1) * pageSize;
      const slice = reversed.slice(start, start + pageSize);

      const entries = slice.map((entry: any, idx: number) => {
        const result: any = {
          index: total - start - idx,
          host: entry.request?.httpService?.host || "",
          port: entry.request?.httpService?.port || 0,
          secure: entry.request?.httpService?.secure || false,
          method: "",
          path: "",
          statusCode: 0,
          contentType: "",
          requestLength: 0,
          responseLength: 0,
          rawRequest: "",
          rawResponse: "",
        };

        if (entry.request?.rawBytesBase64) {
          try {
            const raw = decodeBase64Body(entry.request.rawBytesBase64);
            result.rawRequest = raw;
            result.requestLength = raw.length;
            const firstLine = raw.split("\r\n")[0] || "";
            const parts = firstLine.split(" ");
            result.method = parts[0] || "";
            result.path = parts[1] || "";
          } catch {}
        }

        if (entry.response?.rawBytesBase64) {
          try {
            const raw = decodeBase64Body(entry.response.rawBytesBase64);
            result.rawResponse = raw;
            result.responseLength = raw.length;
            const statusLine = raw.split("\r\n")[0] || "";
            const statusMatch = statusLine.match(/HTTP\/[\d.]+ (\d+)/);
            if (statusMatch) {
              result.statusCode = parseInt(statusMatch[1], 10);
            }
            const ctMatch = raw.match(/content-type:\s*([^\r\n;]+)/i);
            if (ctMatch) {
              result.contentType = ctMatch[1].trim();
            }
          } catch {}
        }

        return result;
      });

      return res.status(200).json({ entries, total, page, pageSize });
    } finally {
      burp.close();
    }
  } catch (error: any) {
    console.error("[burp] Proxy history error:", error.message);

    if (error?.code === 14) {
      return res.status(502).json({
        message: "Could not connect to Burp Suite. Make sure the Burp RPC extension is running.",
      });
    }

    return res.status(500).json({ message: "Failed to fetch proxy history" });
  }
};

export const sendBurpRequest = async (req: Request, res: Response) => {
  try {
    const { host: connHost, port: connPort } = getBurpConnection();

    if (!connHost) {
      return res.status(400).json({ message: "Burp RPC is not configured." });
    }

    const { host, port, secure, rawRequest } = req.body;

    if (!host || !rawRequest) {
      return res.status(400).json({ message: "host and rawRequest are required" });
    }

    // Textareas normalize \r\n to \n; HTTP requires \r\n
    let normalizedRequest = rawRequest.replace(/\r?\n/g, "\r\n");

    // Recalculate Content-Length to match the actual body after normalization
    const headerBodySplit = normalizedRequest.indexOf("\r\n\r\n");
    if (headerBodySplit !== -1) {
      const headersPart = normalizedRequest.substring(0, headerBodySplit);
      const bodyPart = normalizedRequest.substring(headerBodySplit + 4);
      const bodyLength = Buffer.byteLength(bodyPart, "utf-8");

      normalizedRequest =
        headersPart.replace(
          /Content-Length:\s*\d+/i,
          `Content-Length: ${bodyLength}`
        ) +
        "\r\n\r\n" +
        bodyPart;
    }

    const { BurpClient, decodeBase64Body } = await import("burp-rpc");
    const burp = new BurpClient({ host: connHost, port: connPort });

    try {
      const result = await burp.http.sendRawRequest(
        host,
        port || 443,
        secure ?? true,
        normalizedRequest
      );

      let rawResponse = "";
      if (result.response?.rawBytesBase64) {
        rawResponse = decodeBase64Body(result.response.rawBytesBase64);
      }

      return res.status(200).json({
        hasResponse: result.hasResponse ?? !!rawResponse,
        rawResponse,
      });
    } finally {
      burp.close();
    }
  } catch (error: any) {
    console.error("[burp] Send request error:", error.message);
    if (error?.code === 14) {
      return res.status(502).json({ message: "Could not connect to Burp Suite." });
    }
    return res.status(500).json({ message: "Failed to send request" });
  }
};

export const sendToRepeater = async (req: Request, res: Response) => {
  try {
    const { host: connHost, port: connPort } = getBurpConnection();

    if (!connHost) {
      return res.status(400).json({ message: "Burp RPC is not configured." });
    }

    const { host, port, secure, rawRequest, tabName } = req.body;

    if (!host || !rawRequest) {
      return res.status(400).json({ message: "host and rawRequest are required" });
    }

    let normalizedRequest = rawRequest.replace(/\r?\n/g, "\r\n");

    const headerBodySplit = normalizedRequest.indexOf("\r\n\r\n");
    if (headerBodySplit !== -1) {
      const headersPart = normalizedRequest.substring(0, headerBodySplit);
      const bodyPart = normalizedRequest.substring(headerBodySplit + 4);
      const bodyLength = Buffer.byteLength(bodyPart, "utf-8");

      normalizedRequest =
        headersPart.replace(
          /Content-Length:\s*\d+/i,
          `Content-Length: ${bodyLength}`
        ) +
        "\r\n\r\n" +
        bodyPart;
    }

    const { BurpClient, encodeBase64Body } = await import("burp-rpc");
    const burp = new BurpClient({ host: connHost, port: connPort });

    try {
      const b64 = encodeBase64Body(normalizedRequest);
      await burp.repeater.sendToRepeater(
        {
          httpService: { host, port: port || 443, secure: secure ?? true },
          rawBytesBase64: b64,
        },
        tabName || ""
      );

      return res.status(200).json({ message: "Sent to Repeater" });
    } finally {
      burp.close();
    }
  } catch (error: any) {
    console.error("[burp] Send to repeater error:", error.message);
    if (error?.code === 14) {
      return res.status(502).json({ message: "Could not connect to Burp Suite." });
    }
    return res.status(500).json({ message: "Failed to send to Repeater" });
  }
};
