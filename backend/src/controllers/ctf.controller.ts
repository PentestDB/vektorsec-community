import { Response, Request } from "express";
import { v4 as uuidv4 } from "uuid";
import SessionsModel from "../models/Sessions/Sessions.model";
import WorkspaceModel from "../models/Workspace/Workspace.model";
import HistoryArchiveModel from "../models/HistoryArchive/HistoryArchive.model";
import { assertTargetIsExternal } from "../utils/ssrfGuard";
import {
  loginWithCredentials,
  verifyToken,
  fetchChallenges,
  syncToWorkspace,
  sanitizeDirName,
  normalizeCtfdUrl,
  SyncProgressEvent,
  submitFlagToCtfd,
  fetchSolvedChallengeNames,
  detectFlagFormat,
  focusSessionOnChallenge,
} from "../services/ctf.service";
import { execOnWorkspaceHost } from "../services/work-host.service";
import {
  initAndRun,
  createDetachedSSEWriter,
  registerAbortController,
  hasActiveController,
} from "../services/agent.service";

function computeTimeToSolveSec(startedAt: unknown, solvedAt: unknown): number | null {
  if (!startedAt || !solvedAt) return null;
  const t0 = new Date(startedAt as string | Date).getTime();
  const t1 = new Date(solvedAt as string | Date).getTime();
  if (Number.isNaN(t0) || Number.isNaN(t1) || t1 < t0) return null;
  return Math.round((t1 - t0) / 1000);
}

export const connectCtf = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { workspaceId } = req.params;
    const { url, username, password, apiToken } = req.body;

    if (!url) return res.status(400).json({ message: "CTFd URL is required" });

    const workspace = await WorkspaceModel.findOne({ workspaceId, uid: userId, status: "active" });
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });

    const cleanUrl = normalizeCtfdUrl(url);
    let ctfName: string;
    let authMethod: "token" | "credentials";
    let sessionCookie: string | undefined;
    let storedToken: string | undefined;
    // Set when the credentials are good but CTFd will not serve challenges yet
    // (event not started, or team mode with no team). Not a connection failure.
    let unavailableReason: string | undefined;

    if (apiToken) {
      const verified = await verifyToken(cleanUrl, apiToken);
      ctfName = verified.ctfName;
      unavailableReason = verified.unavailableReason;
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

    await WorkspaceModel.updateOne(
      { workspaceId, uid: userId },
      {
        $set: {
          type: "ctf",
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
      message: unavailableReason ? "Connected to CTF — challenges not available yet" : "Connected to CTF",
      ctfName,
      url: cleanUrl,
      challengesAvailable: !unavailableReason,
      unavailableReason,
    });
  } catch (err: any) {
    const status = err?.status ?? err?.response?.status;
    console.error(`[CTF] connect error${status ? ` (${status})` : ""}:`, err.message);
    return res.status(400).json({
      message: err.message || "Failed to connect to CTF",
      code: err?.code,
    });
  }
};

export const getCtfConfig = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { workspaceId } = req.params;

    const workspace = await WorkspaceModel.findOne({ workspaceId, uid: userId });
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });

    if (!workspace.ctfConfig) {
      return res.status(200).json({ connected: false });
    }

    return res.status(200).json({
      connected: true,
      url: workspace.ctfConfig.url,
      ctfName: workspace.ctfConfig.ctfName,
      authMethod: workspace.ctfConfig.authMethod,
      lastSynced: workspace.ctfConfig.lastSynced || null,
      flagFormat: workspace.ctfConfig.flagFormat || null,
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
  const { workspaceId } = req.params;

  try {
    const workspace = await WorkspaceModel.findOne({ workspaceId, uid: userId });
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }
    if (!workspace.ctfConfig) {
      return res.status(400).json({ message: "No CTF connected" });
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const { url, sessionCookie, apiToken, ctfName } = workspace.ctfConfig;

    const onProgress = (event: SyncProgressEvent) => sendSSE(res, event);

    const challenges = await fetchChallenges(url, sessionCookie, apiToken, onProgress);

    const result = await syncToWorkspace(
      workspaceId,
      ctfName,
      challenges,
      url,
      sessionCookie,
      apiToken,
      onProgress,
    );

    const updateFields: Record<string, any> = {
      "ctfConfig.lastSynced": new Date(),
    };

    const existingFlagFormat = workspace.ctfConfig.flagFormat;
    if (!existingFlagFormat) {
      const detected = detectFlagFormat(challenges);
      if (detected) {
        updateFields["ctfConfig.flagFormat"] = detected;
        console.log(`[CTF] Auto-detected flag format: ${detected}`);
      }
    }

    await WorkspaceModel.updateOne(
      { workspaceId, uid: userId },
      { $set: updateFields },
    );

    // Auto-create sessions per challenge
    const existingSessions = await SessionsModel.find({
      workspaceId,
      status: { $ne: "archived" },
    }).select("name").lean();

    const existingNames = new Set(existingSessions.map((s) => s.name));
    const freshWorkspace = await WorkspaceModel.findOne({ workspaceId }).lean();
    const sessionsToCreate = challenges
      .filter((ch) => !existingNames.has(ch.name))
      .map((ch) => ({
        challenge: ch,
        sessionId: uuidv4(),
      }));

    if (sessionsToCreate.length > 0) {
      const createdAt = new Date();
      await HistoryArchiveModel.insertMany(
        sessionsToCreate.map(({ sessionId }) => ({
          sessionId,
          history: [],
        })),
      );
      await SessionsModel.insertMany(
        sessionsToCreate.map(({ challenge: ch, sessionId }) => ({
          uid: userId,
          sessionId,
          workspaceId,
          name: ch.name,
          description: `${ch.category} — ${ch.value} pts`,
          createdAt,
          ctfConfig: freshWorkspace?.ctfConfig,
        })),
      );
    }

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
    const { workspaceId } = req.params;
    const { username, password, apiToken } = req.body;

    const workspace = await WorkspaceModel.findOne({ workspaceId, uid: userId });
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });
    if (!workspace.ctfConfig) {
      return res.status(400).json({ message: "No CTF connected — connect first" });
    }

    const ctfUrl = workspace.ctfConfig.url;
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

    await WorkspaceModel.updateOne({ workspaceId, uid: userId }, { $set: updateFields });

    // Propagate updated auth to all child sessions
    await SessionsModel.updateMany(
      { workspaceId, status: { $ne: "archived" } },
      { $set: updateFields },
    );

    return res.status(200).json({ message: "Auth updated successfully", authMethod: apiToken ? "token" : "credentials" });
  } catch (err: any) {
    console.error("[CTF] reauth error:", err.message);
    return res.status(400).json({ message: err.message || "Re-authentication failed" });
  }
};

export const disconnectCtf = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { workspaceId } = req.params;

    const workspace = await WorkspaceModel.findOne({ workspaceId, uid: userId });
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });

    await WorkspaceModel.updateOne(
      { workspaceId, uid: userId },
      { $unset: { ctfConfig: 1 }, $set: { type: "general" } },
    );

    // Clear ctfConfig from all child sessions
    await SessionsModel.updateMany(
      { workspaceId, status: { $ne: "archived" } },
      { $unset: { ctfConfig: 1 } },
    );

    return res.status(200).json({ message: "Disconnected from CTF" });
  } catch (err: any) {
    console.error("[CTF] disconnect error:", err.message);
    return res.status(400).json({ message: "Failed to disconnect from CTF" });
  }
};

export const setFlagFormat = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { workspaceId } = req.params;
    const { flagFormat } = req.body;

    const workspace = await WorkspaceModel.findOne({ workspaceId, uid: userId });
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });
    if (!workspace.ctfConfig) {
      return res.status(400).json({ message: "No CTF connected" });
    }

    const value = typeof flagFormat === "string" ? flagFormat.trim() : "";

    if (value) {
      await WorkspaceModel.updateOne(
        { workspaceId, uid: userId },
        { $set: { "ctfConfig.flagFormat": value } },
      );
      await SessionsModel.updateMany(
        { workspaceId, status: { $ne: "archived" } },
        { $set: { "ctfConfig.flagFormat": value } },
      );
    } else {
      await WorkspaceModel.updateOne(
        { workspaceId, uid: userId },
        { $unset: { "ctfConfig.flagFormat": 1 } },
      );
      await SessionsModel.updateMany(
        { workspaceId, status: { $ne: "archived" } },
        { $unset: { "ctfConfig.flagFormat": 1 } },
      );
    }

    return res.status(200).json({ message: "Flag format updated", flagFormat: value || null });
  } catch (err: any) {
    console.error("[CTF] setFlagFormat error:", err.message);
    return res.status(400).json({ message: "Failed to update flag format" });
  }
};

export const getCtfChallenges = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { workspaceId } = req.params;

    const workspace = await WorkspaceModel.findOne({ workspaceId, uid: userId })
      .select("ctfConfig")
      .lean();

    if (!workspace?.ctfConfig?.ctfName) {
      return res.status(200).json({ challenges: [], activeSolve: null });
    }

    const safeCTFName = sanitizeDirName(workspace.ctfConfig.ctfName);
    let challenges: Array<{
      id?: number; name: string; category: string; value: number;
      safeDir: string; connection_info?: string;
    }> = [];

    try {
      const indexPath = `${safeCTFName}/challenges.json`;
      const result = await execOnWorkspaceHost(workspaceId, `cat "${indexPath}" 2>/dev/null || echo "[]"`);
      const raw = `${result.stdout}${result.stderr}`;
      challenges = JSON.parse(raw.trim());
    } catch (err: any) {
      console.warn("[CTF] Failed to read challenges.json from attack box:", err.message);
    }

    let ctfdSolved: Set<string> = new Set();
    try {
      const { url, sessionCookie, apiToken } = workspace.ctfConfig;
      ctfdSolved = await fetchSolvedChallengeNames(url, sessionCookie, apiToken);
    } catch {
      // Non-critical
    }

    const sessions = await SessionsModel.find({
      workspaceId,
      status: { $ne: "archived" },
    }).select("sessionId name agentState ctfConfig.solveHistory").lean();
    const sessionByName = new Map(sessions.map((s) => [s.name, s]));

    const solveMap = new Map<string, any>();
    for (const s of sessions) {
      for (const r of (s as any).ctfConfig?.solveHistory ?? []) {
        const existing = solveMap.get(r.challengeName);
        if (!existing || (r.solvedAt && (!existing.solvedAt || r.solvedAt > existing.solvedAt))) {
          solveMap.set(r.challengeName, { ...r, _sessionId: (s as any).sessionId });
        }
      }
    }

    const enriched = challenges.map((ch) => {
      const solve = solveMap.get(ch.name) as any;
      const solvedOnCtfd = ctfdSolved.has(ch.name);
      const sessionInfo = sessionByName.get(ch.name);

      let status: string = "pending";
      let flag: string | null = null;
      let submittedToCtfd = false;

      if (solve) {
        status = solve.status;
        flag = solve.confirmedFlag || null;
        submittedToCtfd = solve.submittedToCtfd || false;

        if (solve.ctfdResult === "incorrect" && !solvedOnCtfd) {
          status = "incorrect";
          submittedToCtfd = false;
        }
      }

      if (solvedOnCtfd && status !== "solved") {
        submittedToCtfd = true;
        if (status === "pending" || status === "solving" || status === "flag_found" || status === "incorrect") {
          status = "solved";
        }
      }

      if (status === "submitted") {
        status = "solved";
      }

      const timeToSolveSec =
        status === "solved"
          ? computeTimeToSolveSec(solve?.startedAt, solve?.solvedAt)
          : null;

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
        startedAt: solve?.startedAt ?? null,
        timeToSolveSec,
        sessionId: sessionInfo?.sessionId ?? null,
        agentState: sessionInfo?.agentState ?? null,
      };
    });

    const activeSolve = workspace.ctfConfig.activeSolve
      ? { name: workspace.ctfConfig.activeSolve.name, safeDir: workspace.ctfConfig.activeSolve.safeDir }
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
    const { workspaceId } = req.params;
    const { challengeName, challengeId, flag } = req.body;

    logSubmitFlag("request", {
      workspaceId,
      challengeName,
      challengeIdFromClient: challengeId ?? null,
      flagLength: typeof flag === "string" ? flag.length : 0,
      flagTrimmedLength: typeof flag === "string" ? flag.trim().length : 0,
    });

    if (!challengeName || !flag) {
      return res.status(400).json({ message: "challengeName and flag are required" });
    }

    const workspace = await WorkspaceModel.findOne({ workspaceId, uid: userId });
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });
    if (!workspace.ctfConfig) {
      return res.status(400).json({ message: "No CTF connected" });
    }

    const { url, sessionCookie, apiToken } = workspace.ctfConfig;

    // SSRF guard: stored CTFd URL must still resolve to a public address.
    try {
      await assertTargetIsExternal(url);
    } catch {
      return res.status(403).json({ message: "Target IP/Domain is restricted for security reasons.", code: "SSRF_BLOCKED" });
    }

    logSubmitFlag("workspace.ctfConfig", {
      ctfdUrl: url,
      ctfName: workspace.ctfConfig.ctfName,
      authMethod: workspace.ctfConfig.authMethod,
      hasApiToken: !!apiToken,
      hasSessionCookie: !!sessionCookie,
    });

    let resolvedId = challengeId;
    if (resolvedId) {
      logSubmitFlag("resolveId.fromClient", { resolvedId, source: "request.body.challengeId" });
    }

    if (!resolvedId) {
      const safeCTFName = sanitizeDirName(workspace.ctfConfig.ctfName);
      try {
        const indexPath = `${safeCTFName}/challenges.json`;
        const result = await execOnWorkspaceHost(workspaceId, `cat "${indexPath}" 2>/dev/null || echo "[]"`);
        const raw = `${result.stdout}${result.stderr}`;
        const challs = JSON.parse(raw.trim());
        const match = challs.find((c: any) => c.name === challengeName);
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

    const session = await SessionsModel.findOne({
      workspaceId,
      name: challengeName,
      status: { $ne: "archived" },
    }).select("sessionId").lean();

    if (session) {
      if (isAccepted) {
        await SessionsModel.updateOne(
          { sessionId: (session as any).sessionId, "ctfConfig.solveHistory.challengeName": challengeName },
          {
            $set: {
              "ctfConfig.solveHistory.$.status": "solved",
              "ctfConfig.solveHistory.$.submittedToCtfd": true,
              "ctfConfig.solveHistory.$.ctfdResult": result.status,
            },
          },
        );
      } else if (result.status === "incorrect") {
        await SessionsModel.updateOne(
          { sessionId: (session as any).sessionId, "ctfConfig.solveHistory.challengeName": challengeName },
          {
            $set: {
              "ctfConfig.solveHistory.$.status": "incorrect",
              "ctfConfig.solveHistory.$.submittedToCtfd": false,
              "ctfConfig.solveHistory.$.ctfdResult": result.status,
            },
          },
        );
      }
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

/**
 * Starts the agent on every session in a CTF workspace whose challenge is not
 * already solved, focusing each session on its own challenge first.
 *
 * Sessions are matched to challenges by name (the same convention the workspace
 * UI uses). Runs are detached — the agent loop persists to the session document,
 * so the UI picks each one up from session history rather than a stream.
 *
 * Responds as soon as the runs are dispatched; it does not wait for solves.
 */
export const startSolvingAll = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { workspaceId } = req.params;

    const workspace = await WorkspaceModel.findOne({ workspaceId, uid: userId })
      .select("type ctfConfig")
      .lean();

    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }
    if (workspace.type !== "ctf") {
      return res.status(400).json({ message: "Solve all is only available for CTF workspaces." });
    }
    if (!workspace.ctfConfig?.ctfName) {
      return res.status(400).json({ message: "No CTF connected. Connect to a CTFd instance first." });
    }

    const safeCTFName = sanitizeDirName(workspace.ctfConfig.ctfName);
    let challenges: Array<{ name: string; category: string; value: number; safeDir: string }> = [];
    try {
      const result = await execOnWorkspaceHost(
        workspaceId,
        `cat "${safeCTFName}/challenges.json" 2>/dev/null || echo "[]"`,
      );
      challenges = JSON.parse(`${result.stdout}${result.stderr}`.trim());
    } catch (err: any) {
      return res.status(400).json({
        message: "Could not read synced challenges from the work host. Run a CTF sync first.",
      });
    }

    if (challenges.length === 0) {
      return res.status(400).json({ message: "No challenges synced yet. Run a CTF sync first." });
    }

    let ctfdSolved: Set<string> = new Set();
    try {
      const { url, sessionCookie, apiToken } = workspace.ctfConfig;
      ctfdSolved = await fetchSolvedChallengeNames(url, sessionCookie, apiToken);
    } catch {
      // Non-critical: fall back to locally tracked solve state.
    }

    const sessions = await SessionsModel.find({
      workspaceId,
      status: { $ne: "archived" },
    })
      .select("sessionId name agentState ctfConfig.solveHistory")
      .lean();
    const sessionByName = new Map(sessions.map((s) => [s.name, s]));

    const solvedLocally = new Set<string>();
    for (const s of sessions) {
      for (const r of (s as any).ctfConfig?.solveHistory ?? []) {
        if (r.status === "solved" || r.status === "submitted") solvedLocally.add(r.challengeName);
      }
    }

    const started: Array<{ sessionId: string; name: string }> = [];
    const skipped: Array<{ name: string; reason: string }> = [];

    for (const ch of challenges) {
      if (ctfdSolved.has(ch.name) || solvedLocally.has(ch.name)) {
        skipped.push({ name: ch.name, reason: "already solved" });
        continue;
      }
      const session = sessionByName.get(ch.name);
      if (!session) {
        skipped.push({ name: ch.name, reason: "no session" });
        continue;
      }
      // Only a live in-process controller means genuinely running. A DB state of
      // "running" with no controller is stale (the process died, or the server
      // restarted) and must be restartable rather than skipped forever.
      if (hasActiveController(session.sessionId)) {
        skipped.push({ name: ch.name, reason: "already running" });
        continue;
      }
      started.push({ sessionId: session.sessionId, name: ch.name });
    }

    // Stale "running" state blocks the UI and hides the fact that nothing is
    // actually executing. Any session we are about to start has no live
    // controller (checked above), so clear it before dispatching.
    if (started.length > 0) {
      await SessionsModel.updateMany(
        { sessionId: { $in: started.map((t) => t.sessionId) }, agentState: "running" },
        { $set: { agentState: "idle" } },
      );
    }

    // Dispatch in a bounded pool rather than all at once. Each agent opens SSH
    // shells on the workspace host, and sshd's defaults (MaxStartups 10:30:100,
    // MaxSessions 10) start dropping connections past ten concurrent — which
    // strands agents with no shell and no output. Override with
    // CTF_SOLVE_ALL_CONCURRENCY=0 for unlimited.
    const configured = parseInt(process.env.CTF_SOLVE_ALL_CONCURRENCY ?? "6", 10);
    const limit = Number.isFinite(configured) && configured > 0 ? configured : started.length;

    void (async () => {
      const queue = [...started];
      const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          await runSolveDetached(next.sessionId, next.name, userId);
        }
      });
      await Promise.allSettled(workers);
    })();

    return res.status(200).json({
      started: started.length,
      skipped: skipped.length,
      startedSessions: started,
      skippedChallenges: skipped,
      message:
        started.length > 0
          ? `Started solving ${started.length} challenge${started.length === 1 ? "" : "s"}.`
          : "Nothing to start — every challenge is solved, already running, or has no session.",
    });
  } catch (err: any) {
    console.error("[CTF] startSolvingAll error:", err);
    return res.status(500).json({ message: err.message ?? "Failed to start solving" });
  }
};

/**
 * Focuses one session on its challenge and runs the agent, detached.
 * Never throws — a single failed session must not affect the others.
 */
async function runSolveDetached(sessionId: string, challengeName: string, userId: string): Promise<void> {
  try {
    const focus = await focusSessionOnChallenge({
      sessionId,
      query: challengeName,
      // Every session targets a different challenge here, so mirroring onto the
      // workspace's single activeSolve would just be last-write-wins noise.
      syncWorkspaceActiveSolve: false,
    });

    if (!focus.ok) {
      console.error(`[CTF] solve-all: could not focus ${sessionId} on "${challengeName}": ${focus.message}`);
      return;
    }

    const ch = focus.challenge;
    const prompt = [
      `Start solving the CTF challenge "${ch.name}".`,
      ``,
      `Category: ${ch.category} | Points: ${ch.points}`,
      `Working directory: ${ch.challengeDir}`,
      ch.files.length > 0 ? `Files: ${ch.files.join(", ")}` : `No attached files.`,
      ``,
      `Work autonomously until you recover the flag. When you find it, record it as the confirmed flag.`,
    ].join("\n");

    const abortCtrl = registerAbortController(sessionId);
    await initAndRun({
      sessionId,
      userId,
      userMessage: prompt,
      sse: createDetachedSSEWriter(sessionId),
      abortSignal: abortCtrl.signal,
    });
  } catch (err: any) {
    console.error(`[CTF] solve-all: run failed for ${sessionId} (${challengeName}):`, err?.message ?? err);
  }
}
