import { Response, Request } from "express";
import SessionsModel from "../models/Sessions/Sessions.model";
import {
  loginWithCredentials,
  verifyToken,
  fetchChallenges,
  syncToWorkspace,
  sanitizeDirName,
  SyncProgressEvent,
  submitFlagToCtfd,
  fetchSolvedChallengeNames,
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

export const reauthCtf = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { sessionId } = req.params;
    const { username, password, apiToken } = req.body;

    const session = await SessionsModel.findOne({ sessionId, uid: userId });
    if (!session) return res.status(404).json({ message: "Session not found" });
    if (!session.ctfConfig) {
      return res.status(400).json({ message: "No CTF connected — connect first" });
    }

    const ctfUrl = session.ctfConfig.url;
    const updateFields: Record<string, any> = {};

    if (apiToken) {
      await verifyToken(ctfUrl, apiToken);
      updateFields["ctfConfig.authMethod"] = "token";
      updateFields["ctfConfig.apiToken"] = apiToken;
      updateFields["ctfConfig.sessionCookie"] = undefined;
    } else if (username && password) {
      const result = await loginWithCredentials(ctfUrl, username, password);
      updateFields["ctfConfig.authMethod"] = "credentials";
      updateFields["ctfConfig.sessionCookie"] = result.sessionCookie;
      updateFields["ctfConfig.username"] = username;
      updateFields["ctfConfig.apiToken"] = undefined;
    } else {
      return res.status(400).json({ message: "Provide either apiToken or username+password" });
    }

    await SessionsModel.updateOne({ sessionId, uid: userId }, { $set: updateFields });

    return res.status(200).json({ message: "Auth updated successfully", authMethod: apiToken ? "token" : "credentials" });
  } catch (err: any) {
    console.error("[CTF] reauth error:", err.message);
    return res.status(400).json({ message: err.message || "Re-authentication failed" });
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
      .select("ctfConfig")
      .lean();

    if (!session?.ctfConfig?.ctfName) {
      return res.status(200).json({ challenges: [], activeSolve: null });
    }

    const safeCTFName = sanitizeDirName(session.ctfConfig.ctfName);
    let challenges: Array<{
      id?: number; name: string; category: string; value: number;
      safeDir: string; connection_info?: string;
    }> = [];

    try {
      const home = (await execSSHCommand("echo $HOME")).trim();
      const resolvedWs = WORKSPACE_DIR.replace(/^~/, home);
      const indexPath = `${resolvedWs}/${safeCTFName}/challenges.json`;
      const raw = await execSSHCommand(`cat "${indexPath}" 2>/dev/null || echo "[]"`);
      challenges = JSON.parse(raw.trim());
    } catch (err: any) {
      console.warn("[CTF] Failed to read challenges.json from attack box:", err.message);
    }

    const solveHistory = session.ctfConfig.solveHistory ?? [];
    const solveMap = new Map(solveHistory.map((r: any) => [r.challengeName, r]));

    // Try to get live solved status from CTFd
    let ctfdSolved: Set<string> = new Set();
    try {
      const { url, sessionCookie, apiToken } = session.ctfConfig;
      ctfdSolved = await fetchSolvedChallengeNames(url, sessionCookie, apiToken);
    } catch {
      // Non-critical — fall back to local data only
    }

    const enriched = challenges.map((ch) => {
      const solve = solveMap.get(ch.name) as any;
      const solvedOnCtfd = ctfdSolved.has(ch.name);

      let status: string = "pending";
      let flag: string | null = null;
      let submittedToCtfd = false;

      if (solve) {
        status = solve.status;
        flag = solve.confirmedFlag || null;
        submittedToCtfd = solve.submittedToCtfd || false;
      }

      if (solvedOnCtfd && status !== "submitted") {
        submittedToCtfd = true;
        if (status === "pending") status = "submitted";
        if (status === "solved") status = "submitted";
      }

      return {
        id: ch.id,
        name: ch.name,
        category: ch.category,
        value: ch.value,
        safeDir: ch.safeDir,
        status,
        flag,
        submittedToCtfd,
        attempts: solve?.attempts ?? 0,
        solvedAt: solve?.solvedAt ?? null,
      };
    });

    const activeSolve = session.ctfConfig.activeSolve
      ? { name: session.ctfConfig.activeSolve.name, safeDir: session.ctfConfig.activeSolve.safeDir }
      : null;

    return res.status(200).json({ challenges: enriched, activeSolve });
  } catch (err: any) {
    console.error("[CTF] getCtfChallenges error:", err.message);
    return res.status(400).json({ message: "Failed to get challenges" });
  }
};

function logSubmitFlag(stage: string, data: Record<string, unknown>) {
  try {
    console.log(`[CTF submit-flag] ${stage}`, JSON.stringify(data, null, 0));
  } catch {
    console.log(`[CTF submit-flag] ${stage}`, data);
  }
}

export const submitFlag = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { sessionId } = req.params;
    const { challengeName, challengeId, flag } = req.body;

    logSubmitFlag("request", {
      sessionId,
      challengeName,
      challengeIdFromClient: challengeId ?? null,
      flagLength: typeof flag === "string" ? flag.length : 0,
      flagTrimmedLength: typeof flag === "string" ? flag.trim().length : 0,
    });

    if (!challengeName || !flag) {
      return res.status(400).json({ message: "challengeName and flag are required" });
    }

    const session = await SessionsModel.findOne({ sessionId, uid: userId });
    if (!session) return res.status(404).json({ message: "Session not found" });
    if (!session.ctfConfig) {
      return res.status(400).json({ message: "No CTF connected" });
    }

    const { url, sessionCookie, apiToken } = session.ctfConfig;

    logSubmitFlag("session.ctfConfig", {
      ctfdUrl: url,
      ctfName: session.ctfConfig.ctfName,
      authMethod: session.ctfConfig.authMethod,
      hasApiToken: !!apiToken,
      hasSessionCookie: !!sessionCookie,
    });

    let resolvedId = challengeId;
    if (resolvedId) {
      logSubmitFlag("resolveId.fromClient", { resolvedId, source: "request.body.challengeId" });
    }

    // Strategy 1: look up from local challenges.json on attack box
    if (!resolvedId) {
      const safeCTFName = sanitizeDirName(session.ctfConfig.ctfName);
      try {
        const home = (await execSSHCommand("echo $HOME")).trim();
        const resolvedWs = WORKSPACE_DIR.replace(/^~/, home);
        const indexPath = `${resolvedWs}/${safeCTFName}/challenges.json`;
        const raw = await execSSHCommand(`cat "${indexPath}" 2>/dev/null || echo "[]"`);
        const challenges = JSON.parse(raw.trim());
        const match = challenges.find((c: any) => c.name === challengeName);
        if (match?.id) resolvedId = match.id;
        logSubmitFlag("resolveId.challengesJson", {
          strategy: "challenges.json",
          indexPath: indexPath ?? "n/a",
          matchedName: match?.name ?? null,
          resolvedId: resolvedId ?? null,
        });
      } catch (e: any) {
        logSubmitFlag("resolveId.challengesJson.error", { message: e?.message });
      }
    }

    // Strategy 2: query CTFd API directly
    if (!resolvedId) {
      try {
        const client = (await import("axios")).default.create({
          baseURL: url,
          headers: {
            "Content-Type": "application/json",
            ...(apiToken ? { Authorization: `Token ${apiToken}` } : {}),
            ...(sessionCookie ? { Cookie: sessionCookie } : {}),
          },
          timeout: 15_000,
        });
        const listRes = await client.get("/api/v1/challenges");
        logSubmitFlag("resolveId.ctfdApi.listMeta", {
          httpStatus: listRes.status,
          success: listRes.data?.success,
          challengeCount: (listRes.data?.data || []).length,
        });
        const ctfdChallenges: any[] = listRes.data?.data || [];
        const match = ctfdChallenges.find(
          (c: any) => c.name === challengeName || c.name.toLowerCase() === challengeName.toLowerCase(),
        );
        if (match?.id) resolvedId = match.id;
        logSubmitFlag("resolveId.ctfdApi", {
          strategy: "GET /api/v1/challenges",
          matchedName: match?.name ?? null,
          resolvedId: resolvedId ?? null,
          listCount: ctfdChallenges.length,
        });
      } catch (err: any) {
        console.warn("[CTF] API fallback for challenge ID failed:", err.message);
        logSubmitFlag("resolveId.ctfdApi.error", { message: err.message, responseStatus: err.response?.status });
      }
    }

    if (!resolvedId) {
      logSubmitFlag("resolveId.failed", { challengeName });
      return res.status(400).json({ message: `Cannot resolve CTFd challenge ID for "${challengeName}"` });
    }

    logSubmitFlag("calling.submitFlagToCtfd", {
      ctfdUrl: url,
      resolvedChallengeId: resolvedId,
      submissionLength: String(flag).trim().length,
    });

    const result = await submitFlagToCtfd(url, resolvedId, flag, sessionCookie, apiToken);

    logSubmitFlag("submitFlagToCtfd.result", {
      status: result.status,
      message: result.message,
      httpStatus: result.httpStatus,
      rawData: result.rawData,
    });

    const isAccepted = result.status === "correct" || result.status === "already_solved";

    if (isAccepted) {
      await SessionsModel.updateOne(
        { sessionId, uid: userId, "ctfConfig.solveHistory.challengeName": challengeName },
        {
          $set: {
            "ctfConfig.solveHistory.$.status": "submitted",
            "ctfConfig.solveHistory.$.submittedToCtfd": true,
            "ctfConfig.solveHistory.$.ctfdResult": result.status,
          },
        },
      );
    }

    const payload = {
      success: isAccepted,
      status: result.status,
      message: result.message,
    };
    logSubmitFlag("response", {
      ...payload,
      ctfdUrl: url,
      resolvedChallengeId: resolvedId,
      authUsed: apiToken ? "api_token" : sessionCookie ? "session_cookie" : "none",
    });
    return res.status(200).json(payload);
  } catch (err: any) {
    console.error("[CTF] submitFlag error:", err.message);
    logSubmitFlag("error", { message: err.message, stack: err.stack?.split("\n").slice(0, 5) });
    return res.status(400).json({ message: err.message || "Failed to submit flag" });
  }
};
