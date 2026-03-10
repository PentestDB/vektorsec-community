import { Request, Response } from "express";
import { readEnvFile } from "../utils/envWriter";

const BURP_DISCONNECTED_MSG =
  "Burp Suite appears to be disconnected. " +
  "Please verify the Burp RPC extension is loaded and running, " +
  "and check your host/port configuration in Settings.";

function getBurpConnection() {
  const env = readEnvFile();
  const host = env.BURP_RPC_HOST;
  const port = parseInt(env.BURP_RPC_PORT || "50051", 10);
  return { host, port };
}

async function createBurpClient(host: string, port: number) {
  const { BurpClient } = await import("burp-rpc");
  return new BurpClient({ host, port });
}

function isBurpUnreachable(err: any): boolean {
  return err?.code === 14 || err?.code === 4;
}

/**
 * Lightweight health check for Burp connectivity.
 * No auth required — useful for monitoring and dashboards.
 * Uses the dedicated Ping RPC to verify the gRPC channel is alive.
 */
export const getBurpHealth = async (_req: Request, res: Response) => {
  try {
    const { host, port } = getBurpConnection();

    if (!host || !String(host).trim()) {
      return res.status(200).json({
        configured: false,
        connected: false,
        message: "Burp RPC is not configured.",
      });
    }

    const burp = await createBurpClient(host, port);

    try {
      const ping = await burp.ping();
      return res.status(200).json({
        configured: true,
        connected: true,
        burpVersion: ping.burpVersion,
        extensionVersion: ping.extensionVersion,
      });
    } catch {
      return res.status(200).json({
        configured: true,
        connected: false,
        message: BURP_DISCONNECTED_MSG,
      });
    } finally {
      burp.close();
    }
  } catch (error: any) {
    return res.status(200).json({
      configured: true,
      connected: false,
      message: BURP_DISCONNECTED_MSG,
    });
  }
};

export const getBurpConnectionStatus = async (_req: Request, res: Response) => {
  try {
    const { host, port } = getBurpConnection();

    if (!host || !String(host).trim()) {
      return res.status(200).json({
        configured: false,
        connected: false,
        message: "Burp RPC is not configured. Set the host and port in Settings.",
      });
    }

    const burp = await createBurpClient(host, port);

    try {
      const ping = await burp.ping();
      return res.status(200).json({
        configured: true,
        connected: true,
        burpVersion: ping.burpVersion,
        extensionVersion: ping.extensionVersion,
      });
    } catch {
      return res.status(200).json({
        configured: true,
        connected: false,
        message: BURP_DISCONNECTED_MSG,
      });
    } finally {
      burp.close();
    }
  } catch (error: any) {
    return res.status(200).json({
      configured: true,
      connected: false,
      message: BURP_DISCONNECTED_MSG,
    });
  }
};

export const getBurpProxyHistory = async (req: Request, res: Response) => {
  try {
    const { host, port } = getBurpConnection();

    if (!host || !String(host).trim()) {
      return res.status(400).json({
        message: "Burp RPC is not configured. Set the host and port in Settings.",
        notConfigured: true,
      });
    }

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string, 10) || 20));

    const filter: any = {};
    if (req.query.search) filter.search = req.query.search as string;
    if (req.query.method) filter.methods = (req.query.method as string).split(",").filter(Boolean);
    if (req.query.statusMin) filter.statusMin = parseInt(req.query.statusMin as string, 10) || 0;
    if (req.query.statusMax) filter.statusMax = parseInt(req.query.statusMax as string, 10) || 0;
    if (req.query.hideAssets === "true") filter.hideAssets = true;

    const burp = await createBurpClient(host, port);

    try {
      const allEntries = await burp.proxy.getHistorySummary(filter);
      const total = allEntries.length;

      const reversed = [...allEntries].reverse();
      const start = (page - 1) * pageSize;
      const slice = reversed.slice(start, start + pageSize);

      const entries = slice.map((entry: any, idx: number) => ({
        ...entry,
        index: total - start - idx,
      }));

      return res.status(200).json({ entries, total, page, pageSize });
    } finally {
      burp.close();
    }
  } catch (error: any) {
    console.error("[burp] Proxy history error:", error.message);

    if (isBurpUnreachable(error)) {
      return res.status(502).json({ message: BURP_DISCONNECTED_MSG });
    }

    return res.status(500).json({ message: "Failed to fetch proxy history" });
  }
};

export const getBurpProxyEntry = async (req: Request, res: Response) => {
  try {
    const { host, port } = getBurpConnection();

    if (!host) {
      return res.status(400).json({
        message: "Burp RPC is not configured.",
        notConfigured: true,
      });
    }

    const entryId = parseInt(req.params.id, 10);
    if (isNaN(entryId)) {
      return res.status(400).json({ message: "Invalid entry ID" });
    }

    const { decodeBase64Body } = await import("burp-rpc");
    const burp = await createBurpClient(host, port);

    try {
      const entry = await burp.proxy.getEntry(entryId);

      const result: any = {
        id: entry.id,
        host: entry.request?.httpService?.host || "",
        port: entry.request?.httpService?.port || 0,
        secure: entry.request?.httpService?.secure || false,
        rawRequest: "",
        rawResponse: "",
      };

      if (entry.request?.rawBytesBase64) {
        result.rawRequest = decodeBase64Body(entry.request.rawBytesBase64);
      }

      if (entry.response?.rawBytesBase64) {
        result.rawResponse = decodeBase64Body(entry.response.rawBytesBase64);
      }

      return res.status(200).json(result);
    } finally {
      burp.close();
    }
  } catch (error: any) {
    console.error("[burp] Proxy entry error:", error.message);

    if (isBurpUnreachable(error)) {
      return res.status(502).json({ message: BURP_DISCONNECTED_MSG });
    }

    return res.status(500).json({ message: "Failed to fetch proxy entry" });
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

    const { decodeBase64Body } = await import("burp-rpc");
    const burp = await createBurpClient(connHost, connPort);

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
    if (isBurpUnreachable(error)) {
      return res.status(502).json({ message: BURP_DISCONNECTED_MSG });
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

    const { encodeBase64Body } = await import("burp-rpc");
    const burp = await createBurpClient(connHost, connPort);

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
    if (isBurpUnreachable(error)) {
      return res.status(502).json({ message: BURP_DISCONNECTED_MSG });
    }
    return res.status(500).json({ message: "Failed to send to Repeater" });
  }
};

function normalizeHttpRequest(rawRequest: string): string {
  let normalizedRequest = rawRequest.replace(/\r?\n/g, "\r\n");
  const headerBodySplit = normalizedRequest.indexOf("\r\n\r\n");
  if (headerBodySplit !== -1) {
    const headersPart = normalizedRequest.substring(0, headerBodySplit);
    const bodyPart = normalizedRequest.substring(headerBodySplit + 4);
    const bodyLength = Buffer.byteLength(bodyPart, "utf-8");
    normalizedRequest =
      headersPart.replace(/Content-Length:\s*\d+/i, `Content-Length: ${bodyLength}`) +
      "\r\n\r\n" +
      bodyPart;
  }
  return normalizedRequest;
}

export const sendToIntruder = async (req: Request, res: Response) => {
  try {
    const { host: connHost, port: connPort } = getBurpConnection();
    if (!connHost) {
      return res.status(400).json({ message: "Burp RPC is not configured." });
    }

    const { host, port, secure, rawRequest, tabName, insertionPoints } = req.body;
    if (!host || !rawRequest) {
      return res.status(400).json({ message: "host and rawRequest are required" });
    }

    const { encodeBase64Body } = await import("burp-rpc");
    const normalized = normalizeHttpRequest(rawRequest);
    const burp = await createBurpClient(connHost, connPort);

    try {
      const b64 = encodeBase64Body(normalized);
      await burp.intruder.sendToIntruder(
        host,
        port || 443,
        secure ?? true,
        b64,
        tabName || "",
        insertionPoints || []
      );

      return res.status(200).json({ message: "Sent to Intruder" });
    } finally {
      burp.close();
    }
  } catch (error: any) {
    console.error("[burp] Send to intruder error:", error.message);
    if (isBurpUnreachable(error)) {
      return res.status(502).json({ message: BURP_DISCONNECTED_MSG });
    }
    return res.status(500).json({ message: "Failed to send to Intruder" });
  }
};

export const sendAndReceiveRepeater = async (req: Request, res: Response) => {
  try {
    const { host: connHost, port: connPort } = getBurpConnection();
    if (!connHost) {
      return res.status(400).json({ message: "Burp RPC is not configured." });
    }

    const { host, port, secure, rawRequest } = req.body;
    if (!host || !rawRequest) {
      return res.status(400).json({ message: "host and rawRequest are required" });
    }

    const { encodeBase64Body, decodeBase64Body } = await import("burp-rpc");
    const normalized = normalizeHttpRequest(rawRequest);
    const burp = await createBurpClient(connHost, connPort);

    try {
      const b64 = encodeBase64Body(normalized);
      const result = await burp.repeater.sendAndReceive(
        host,
        port || 443,
        secure ?? true,
        b64
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
    console.error("[burp] Repeater send error:", error.message);
    if (isBurpUnreachable(error)) {
      return res.status(502).json({ message: BURP_DISCONNECTED_MSG });
    }
    return res.status(500).json({ message: "Failed to send via Repeater" });
  }
};

export const generateCollaboratorPayload = async (req: Request, res: Response) => {
  try {
    const { host: connHost, port: connPort } = getBurpConnection();
    if (!connHost) {
      return res.status(400).json({ message: "Burp RPC is not configured." });
    }

    const { customData } = req.body || {};
    const burp = await createBurpClient(connHost, connPort);

    try {
      const result = await burp.collaborator.generatePayload(customData || "");
      return res.status(200).json(result);
    } finally {
      burp.close();
    }
  } catch (error: any) {
    console.error("[burp] Collaborator generate error:", error.message);
    if (isBurpUnreachable(error)) {
      return res.status(502).json({ message: BURP_DISCONNECTED_MSG });
    }
    return res.status(500).json({ message: "Failed to generate Collaborator payload" });
  }
};

export const pollCollaborator = async (req: Request, res: Response) => {
  try {
    const { host: connHost, port: connPort } = getBurpConnection();
    if (!connHost) {
      return res.status(400).json({ message: "Burp RPC is not configured." });
    }

    const { secretKey } = req.body;
    if (!secretKey) {
      return res.status(400).json({ message: "secretKey is required" });
    }

    const burp = await createBurpClient(connHost, connPort);

    try {
      const interactions = await burp.collaborator.poll(secretKey);
      return res.status(200).json({ interactions });
    } finally {
      burp.close();
    }
  } catch (error: any) {
    console.error("[burp] Collaborator poll error:", error.message);
    if (isBurpUnreachable(error)) {
      return res.status(502).json({ message: BURP_DISCONNECTED_MSG });
    }
    return res.status(500).json({ message: "Failed to poll Collaborator" });
  }
};

export const getProxyInterceptStatus = async (req: Request, res: Response) => {
  try {
    const { host, port } = getBurpConnection();
    if (!host) {
      return res.status(400).json({ message: "Burp RPC is not configured." });
    }

    const burp = await createBurpClient(host, port);

    try {
      const enabled = await burp.proxy.isInterceptEnabled();
      return res.status(200).json({ enabled });
    } finally {
      burp.close();
    }
  } catch (error: any) {
    console.error("[burp] Intercept status error:", error.message);
    if (isBurpUnreachable(error)) {
      return res.status(502).json({ message: BURP_DISCONNECTED_MSG });
    }
    return res.status(500).json({ message: "Failed to get intercept status" });
  }
};

export const setProxyIntercept = async (req: Request, res: Response) => {
  try {
    const { host, port } = getBurpConnection();
    if (!host) {
      return res.status(400).json({ message: "Burp RPC is not configured." });
    }

    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "enabled (boolean) is required" });
    }

    const burp = await createBurpClient(host, port);

    try {
      await burp.proxy.setIntercept(enabled);
      return res.status(200).json({ enabled });
    } finally {
      burp.close();
    }
  } catch (error: any) {
    console.error("[burp] Set intercept error:", error.message);
    if (isBurpUnreachable(error)) {
      return res.status(502).json({ message: BURP_DISCONNECTED_MSG });
    }
    return res.status(500).json({ message: "Failed to set intercept" });
  }
};
