import { Request, Response } from "express";
import {
  CAIDO_UNREACHABLE_MSG,
  createCaidoAutomateSession,
  createCaidoReplaySession,
  getCaidoConnection,
  getCaidoEntry,
  getCaidoHealth,
  getCaidoHistory,
  getCaidoInterceptState,
  isCaidoConfigured,
  sendCaidoReplayRequest,
  setCaidoInterceptEnabled,
} from "../services/caido.client";

function caidoError(res: Response, error: any, fallback: string) {
  const message = error?.message || fallback;
  if (/auth|token|pat|forbidden|unauthorized/i.test(message)) {
    return res.status(401).json({ message });
  }
  return res.status(502).json({ message: message || CAIDO_UNREACHABLE_MSG });
}

function replayInput(req: Request) {
  const { host, port, secure, rawRequest, tabName } = req.body;
  if (!host || !rawRequest) {
    return { error: "host and rawRequest are required" };
  }
  return {
    host: String(host),
    port: parseInt(String(port || (secure === false ? 80 : 443)), 10),
    secure: secure ?? true,
    rawRequest: String(rawRequest),
    tabName: tabName ? String(tabName) : undefined,
  };
}

function automateInput(req: Request) {
  const input = replayInput(req);
  if ("error" in input) return input;

  const placeholders = Array.isArray(req.body.placeholders)
    ? req.body.placeholders
        .map((placeholder: any) => ({
          start: Number(placeholder?.start),
          end: Number(placeholder?.end),
        }))
        .filter((placeholder: any) => Number.isFinite(placeholder.start) && Number.isFinite(placeholder.end))
    : undefined;

  const payloads = Array.isArray(req.body.payloads)
    ? req.body.payloads.map((payload: any) => String(payload))
    : undefined;

  const strategy = ["SEQUENTIAL", "ALL", "PARALLEL", "MATRIX"].includes(req.body.strategy)
    ? req.body.strategy
    : undefined;

  return {
    ...input,
    placeholders,
    payloads,
    strategy,
    run: req.body.run === true,
  };
}

export const getCaidoHealthController = async (_req: Request, res: Response) => {
  try {
    return res.status(200).json(await getCaidoHealth());
  } catch {
    return res.status(200).json({
      configured: true,
      connected: false,
      message: CAIDO_UNREACHABLE_MSG,
    });
  }
};

export const getCaidoConnectionStatus = async (_req: Request, res: Response) => {
  try {
    return res.status(200).json(await getCaidoHealth());
  } catch {
    return res.status(200).json({
      configured: true,
      connected: false,
      message: CAIDO_UNREACHABLE_MSG,
    });
  }
};

export const getCaidoHttpHistory = async (req: Request, res: Response) => {
  try {
    const conn = getCaidoConnection();
    if (!isCaidoConfigured(conn)) {
      return res.status(400).json({
        message: "Caido is not configured. Set the URL and PAT in Settings.",
        notConfigured: true,
      });
    }

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string, 10) || 20));
    const statusMin = req.query.statusMin ? parseInt(req.query.statusMin as string, 10) : undefined;
    const statusMax = req.query.statusMax ? parseInt(req.query.statusMax as string, 10) : undefined;

    const result = await getCaidoHistory({
      page,
      pageSize,
      filter: {
        search: req.query.search as string | undefined,
        method: req.query.method as string | undefined,
        statusMin,
        statusMax,
        hideAssets: req.query.hideAssets === "true",
      },
    });
    return res.status(200).json(result);
  } catch (error: any) {
    console.error("[caido] HTTP history error:", error.message);
    return caidoError(res, error, "Failed to fetch Caido HTTP history");
  }
};

export const getCaidoHttpEntry = async (req: Request, res: Response) => {
  try {
    const conn = getCaidoConnection();
    if (!isCaidoConfigured(conn)) {
      return res.status(400).json({
        message: "Caido is not configured.",
        notConfigured: true,
      });
    }

    const entry = await getCaidoEntry(req.params.id);
    if (!entry) return res.status(404).json({ message: "Caido HTTP entry not found" });
    return res.status(200).json(entry);
  } catch (error: any) {
    console.error("[caido] HTTP entry error:", error.message);
    return caidoError(res, error, "Failed to fetch Caido HTTP entry");
  }
};

export const sendCaidoRequest = async (req: Request, res: Response) => {
  try {
    const conn = getCaidoConnection();
    if (!isCaidoConfigured(conn)) {
      return res.status(400).json({ message: "Caido is not configured." });
    }

    const input = replayInput(req);
    if ("error" in input) return res.status(400).json({ message: input.error });

    return res.status(200).json(await sendCaidoReplayRequest(input));
  } catch (error: any) {
    console.error("[caido] Send request error:", error.message);
    return caidoError(res, error, "Failed to send request through Caido");
  }
};

export const sendToCaidoReplay = async (req: Request, res: Response) => {
  try {
    const conn = getCaidoConnection();
    if (!isCaidoConfigured(conn)) {
      return res.status(400).json({ message: "Caido is not configured." });
    }

    const input = replayInput(req);
    if ("error" in input) return res.status(400).json({ message: input.error });

    const session = await createCaidoReplaySession(input);
    return res.status(200).json({ message: "Sent to Caido Replay", sessionId: session.id });
  } catch (error: any) {
    console.error("[caido] Send to Replay error:", error.message);
    return caidoError(res, error, "Failed to send to Caido Replay");
  }
};

export const sendToCaidoAutomate = async (req: Request, res: Response) => {
  try {
    const conn = getCaidoConnection();
    if (!isCaidoConfigured(conn)) {
      return res.status(400).json({ message: "Caido is not configured." });
    }

    const input = automateInput(req);
    if ("error" in input) return res.status(400).json({ message: input.error });

    const session = await createCaidoAutomateSession(input);
    return res.status(200).json({
      message: session.task ? "Started Caido Automate task" : "Sent to Caido Automate",
      sessionId: session.sessionId,
      name: session.name,
      task: session.task,
    });
  } catch (error: any) {
    console.error("[caido] Send to Automate error:", error.message);
    return caidoError(res, error, "Failed to send to Caido Automate");
  }
};

export const getCaidoInterceptStatus = async (_req: Request, res: Response) => {
  try {
    const conn = getCaidoConnection();
    if (!isCaidoConfigured(conn)) {
      return res.status(400).json({ message: "Caido is not configured." });
    }

    return res.status(200).json(await getCaidoInterceptState());
  } catch (error: any) {
    console.error("[caido] Intercept status error:", error.message);
    return caidoError(res, error, "Failed to fetch Caido Intercept status");
  }
};

export const setCaidoIntercept = async (req: Request, res: Response) => {
  try {
    const conn = getCaidoConnection();
    if (!isCaidoConfigured(conn)) {
      return res.status(400).json({ message: "Caido is not configured." });
    }

    if (typeof req.body.enabled !== "boolean") {
      return res.status(400).json({ message: "enabled must be a boolean" });
    }

    return res.status(200).json(await setCaidoInterceptEnabled(req.body.enabled));
  } catch (error: any) {
    console.error("[caido] Set intercept error:", error.message);
    return caidoError(res, error, "Failed to update Caido Intercept");
  }
};
