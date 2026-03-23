import { Response, Request } from "express";
import SessionsModel from "../models/Sessions/Sessions.model";
import {
  loginWithCredentials,
  verifyToken,
  fetchChallenges,
  syncToWorkspace,
  sanitizeDirName,
  SyncProgressEvent,
} from "../services/ctf.service";
import { execSSHCommand } from "../services/ssh.service";
import { WORKSPACE_DIR } from "../utils/commandSafety";

export const connectCtf = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { sessionId } = req.params;
    const { url, username, password, apiToken } = req.body;

    if (!url) return res.status(400).json({ message: "CTFd URL is required" });

    const session = await SessionsModel.findOne({ sessionId, uid: userId });
    if (!session) return res.status(404).json({ message: "Session not found" });

    const cleanUrl = url.replace(/\/+$/, "");
    let ctfName: string;
    let authMethod: "token" | "credentials";
    let sessionCookie: string | undefined;
    let storedToken: string | undefined;

    if (apiToken) {
      ctfName = await verifyToken(cleanUrl, apiToken);
      authMethod = "token";
      storedToken = apiToken;
    } else if (username && password) {
      const result = await loginWithCredentials(cleanUrl, username, password);
      sessionCookie = result.sessionCookie;
      ctfName = result.ctfName;
      authMethod = "credentials";
    } else {
      return res.status(400).json({ message: "Provide either apiToken or username+password" });
    }

    await SessionsModel.updateOne(
      { sessionId, uid: userId },
      {
        $set: {
          ctfConfig: {
            url: cleanUrl,
            ctfName,
            authMethod,
            apiToken: storedToken,
            username,
            sessionCookie,
          },
        },
      },
    );

    return res.status(200).json({
      message: "Connected to CTF",
      ctfName,
      url: cleanUrl,
    });
  } catch (err: any) {
    console.error("[CTF] connect error:", err.message);
    return res.status(400).json({ message: err.message || "Failed to connect to CTF" });
  }
};

export const getCtfConfig = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { sessionId } = req.params;

    const session = await SessionsModel.findOne({ sessionId, uid: userId });
    if (!session) return res.status(404).json({ message: "Session not found" });

    if (!session.ctfConfig) {
      return res.status(200).json({ connected: false });
    }

    return res.status(200).json({
      connected: true,
      url: session.ctfConfig.url,
      ctfName: session.ctfConfig.ctfName,
      authMethod: session.ctfConfig.authMethod,
      lastSynced: session.ctfConfig.lastSynced || null,
    });
  } catch (err: any) {
    console.error("[CTF] getConfig error:", err.message);
    return res.status(400).json({ message: "Failed to get CTF config" });
  }
};

function sendSSE(res: Response, event: SyncProgressEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export const syncCtf = async (req: Request, res: Response) => {
  const userId = res.locals.userId;
  const { sessionId } = req.params;

  try {
    const session = await SessionsModel.findOne({ sessionId, uid: userId });
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }
    if (!session.ctfConfig) {
      return res.status(400).json({ message: "No CTF connected" });
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const { url, sessionCookie, apiToken, ctfName } = session.ctfConfig;

    const onProgress = (event: SyncProgressEvent) => sendSSE(res, event);

    const challenges = await fetchChallenges(url, sessionCookie, apiToken, onProgress);

    const result = await syncToWorkspace(
      ctfName,
      challenges,
      url,
      sessionCookie,
      apiToken,
      onProgress,
    );

    await SessionsModel.updateOne(
      { sessionId, uid: userId },
      { $set: { "ctfConfig.lastSynced": new Date() } },
    );

    sendSSE(res, {
      phase: "done",
      total: challenges.length,
      synced: result.synced,
      updated: result.updated,
      skipped: result.skipped,
    });

    res.end();
  } catch (err: any) {
    console.error("[CTF] sync error:", err.message);
    if (res.headersSent) {
      sendSSE(res, { phase: "error", detail: err.message || "Sync failed" });
      res.end();
    } else {
      res.status(400).json({ message: err.message || "Failed to sync challenges" });
    }
  }
};

export const disconnectCtf = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { sessionId } = req.params;

    const session = await SessionsModel.findOne({ sessionId, uid: userId });
    if (!session) return res.status(404).json({ message: "Session not found" });

    await SessionsModel.updateOne(
      { sessionId, uid: userId },
      { $unset: { ctfConfig: 1 } },
    );

    return res.status(200).json({ message: "Disconnected from CTF" });
  } catch (err: any) {
    console.error("[CTF] disconnect error:", err.message);
    return res.status(400).json({ message: "Failed to disconnect from CTF" });
  }
};

export const getCtfChallenges = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { sessionId } = req.params;

    const session = await SessionsModel.findOne({ sessionId, uid: userId })
      .select("ctfConfig.ctfName ctfConfig.activeSolve")
      .lean();

    if (!session?.ctfConfig?.ctfName) {
      return res.status(200).json({ challenges: [], activeSolve: null });
    }

    const safeCTFName = sanitizeDirName(session.ctfConfig.ctfName);
    let challenges: Array<{ name: string; category: string; value: number; safeDir: string }> = [];

    try {
      const home = (await execSSHCommand("echo $HOME")).trim();
      const resolvedWs = WORKSPACE_DIR.replace(/^~/, home);
      const indexPath = `${resolvedWs}/${safeCTFName}/challenges.json`;
      const raw = await execSSHCommand(`cat "${indexPath}" 2>/dev/null || echo "[]"`);
      challenges = JSON.parse(raw.trim());
    } catch (err: any) {
      console.warn("[CTF] Failed to read challenges.json from attack box:", err.message);
    }

    const activeSolve = session.ctfConfig.activeSolve
      ? { name: session.ctfConfig.activeSolve.name, safeDir: session.ctfConfig.activeSolve.safeDir }
      : null;

    return res.status(200).json({ challenges, activeSolve });
  } catch (err: any) {
    console.error("[CTF] getCtfChallenges error:", err.message);
    return res.status(400).json({ message: "Failed to get challenges" });
  }
};
