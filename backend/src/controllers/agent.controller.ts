import { Response, Request } from "express";
import { v4 as uuidv4 } from "uuid";
import SessionsModel from "../models/Sessions/Sessions.model";
import HistoryArchiveModel from "../models/HistoryArchive/HistoryArchive.model";
import { requireActiveSession } from "../services/session.helpers";
import {
  createSSEWriter,
  initAndRun,
  handleConsent,
  handleManualOutput,
  runAgentLoop,
  setPaused,
  registerAbortController,
  abortSession,
  hasActiveController,
} from "../services/agent.service";
import { parseSlashCommand, executeSlashCommand, matchCommands, SLASH_COMMANDS } from "../services/slash-commands";
import { toolRegistry } from "../tools/registry";
import { getUnconfiguredToolNames } from "../utils/toolAvailability";
import { getProvider } from "../utils/llm/providers";
import { sessionLifecycle } from "../services/session.lifecycle";
import { getCapabilityByName } from "../capabilities/registry";
import WorkspaceModel from "../models/Workspace/Workspace.model";

export const createSession = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { name, description, workspaceId: providedWorkspaceId } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Session name is required" });
    }

    let workspaceId = providedWorkspaceId;

    if (!workspaceId) {
      workspaceId = uuidv4();
      const workspace = new WorkspaceModel({
        uid: userId,
        workspaceId,
        name: name.length > 50 ? name.substring(0, 50) + "..." : name,
        description: description?.substring(0, 500) ?? "",
        type: "general",
        createdAt: new Date(),
      });
      await workspace.save();
    }

    const sessionId = uuidv4();

    const archiveHistory = new HistoryArchiveModel({
      sessionId,
      history: [],
    });
    await archiveHistory.save();

    const session = new SessionsModel({
      uid: userId,
      sessionId,
      workspaceId,
      name: name.length > 50 ? name.substring(0, 50) + "..." : name,
      description: description?.substring(0, 500) ?? "",
      createdAt: new Date(),
    });
    await session.save();

    return res.status(200).json({ sessionId, workspaceId, message: "Session created" });
  } catch (err: any) {
    console.error("[agent] createSession error:", err);
    return res.status(400).json({ message: "Failed to create session" });
  }
};

export const sendMessage = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { sessionId, message } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ message: "sessionId and message are required" });
    }

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    if (session.agentState === "running") {
      if (hasActiveController(sessionId)) {
        return res.status(409).json({ message: "Agent is already running" });
      }
      console.warn(`[agent] Session ${sessionId} was stuck in "running" state with no active process. Resetting.`);
      await SessionsModel.updateOne({ sessionId }, { $set: { agentState: "idle" } });
    }

    const sse = createSSEWriter(res);
    const abortCtrl = registerAbortController(sessionId);

    req.on("close", () => {
      abortSession(sessionId);
      setPaused(sessionId, true).catch(() => {});
    });

    await initAndRun({
      sessionId,
      userId,
      userMessage: message,
      sse,
      abortSignal: abortCtrl.signal,
    });
  } catch (err: any) {
    console.error("[agent] sendMessage error:", err);
    if (!res.headersSent) {
      return res.status(500).json({ message: err.message ?? "Agent error" });
    }
  }
};

export const pauseAgent = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ message: "sessionId is required" });
    }

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    abortSession(sessionId);
    await setPaused(sessionId, true);

    return res.status(200).json({ message: "Pause signal sent" });
  } catch (err: any) {
    console.error("[agent] pauseAgent error:", err);
    return res.status(500).json({ message: "Failed to pause agent" });
  }
};

export const resumeAgent = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { sessionId, message } = req.body;

    if (!sessionId) {
      return res.status(400).json({ message: "sessionId is required" });
    }

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    if (session.agentState === "running") {
      if (hasActiveController(sessionId)) {
        return res.status(409).json({ message: "Agent is already running" });
      }
      console.warn(`[agent] Session ${sessionId} was stuck in "running" state with no active process. Resetting.`);
      await SessionsModel.updateOne({ sessionId }, { $set: { agentState: "idle" } });
    }

    const sse = createSSEWriter(res);
    const abortCtrl = registerAbortController(sessionId);

    req.on("close", () => {
      abortSession(sessionId);
      setPaused(sessionId, true).catch(() => {});
    });

    await setPaused(sessionId, false);

    if (message) {
      await initAndRun({ sessionId, userId, userMessage: message, sse, abortSignal: abortCtrl.signal });
    } else {
      await runAgentLoop({ sessionId, userId, sse, abortSignal: abortCtrl.signal });
    }
  } catch (err: any) {
    console.error("[agent] resumeAgent error:", err);
    if (!res.headersSent) {
      return res.status(500).json({ message: err.message ?? "Resume error" });
    }
  }
};

export const respondToConsent = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { sessionId, approved } = req.body;

    if (!sessionId || typeof approved !== "boolean") {
      return res.status(400).json({ message: "sessionId and approved (boolean) are required" });
    }

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    if (session.agentState !== "waiting_consent") {
      return res.status(400).json({ message: "No pending consent request" });
    }

    const sse = createSSEWriter(res);
    const abortCtrl = registerAbortController(sessionId);

    req.on("close", () => {
      abortSession(sessionId);
      setPaused(sessionId, true).catch(() => {});
    });

    await handleConsent({ sessionId, userId, approved, sse, abortSignal: abortCtrl.signal });
  } catch (err: any) {
    console.error("[agent] respondToConsent error:", err);
    if (!res.headersSent) {
      return res.status(500).json({ message: err.message ?? "Consent error" });
    }
  }
};

export const submitManualOutput = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { sessionId, output } = req.body;

    if (!sessionId || typeof output !== "string") {
      return res.status(400).json({ message: "sessionId and output (string) are required" });
    }

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    if (session.agentState !== "waiting_manual_execution") {
      return res.status(400).json({ message: "No pending manual execution" });
    }

    const sse = createSSEWriter(res);
    const abortCtrl = registerAbortController(sessionId);

    req.on("close", () => {
      abortSession(sessionId);
      setPaused(sessionId, true).catch(() => {});
    });

    await handleManualOutput({ sessionId, userId, output, sse, abortSignal: abortCtrl.signal });
  } catch (err: any) {
    console.error("[agent] submitManualOutput error:", err);
    if (!res.headersSent) {
      return res.status(500).json({ message: err.message ?? "Manual execution error" });
    }
  }
};

export const getHistory = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ message: "sessionId is required" });
    }

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    let contextLimit = 128_000;
    try {
      const config = await getProvider();
      const MODEL_LIMITS: Record<string, number> = {
        "gpt-4o": 128_000, "gpt-4o-mini": 128_000, "gpt-4-turbo": 128_000,
        "gpt-4": 8_192, "gpt-3.5-turbo": 16_385, "gpt-5-nano": 128_000,
        "claude-sonnet-4-6": 1_000_000, "claude-opus-4-6": 1_000_000,
        "claude-haiku-4-5": 200_000, "claude-sonnet-4-5": 200_000,
        "claude-sonnet-4-20250514": 200_000, "claude-3-5-sonnet-20241022": 200_000,
        "claude-3-opus-20240229": 200_000, "claude-3-haiku-20240307": 200_000,
      };
      for (const [key, limit] of Object.entries(MODEL_LIMITS)) {
        if (config.model.includes(key)) { contextLimit = limit; break; }
      }
    } catch { /* use default */ }

    const latestTokenSnapshot = session.tokenHistory?.[session.tokenHistory.length - 1];
    const contextTokens = latestTokenSnapshot?.promptTokens ?? 0;

    return res.status(200).json({
      messages: session.messages,
      agentState: session.agentState,
      turnIndex: session.turnIndex,
      pendingConsent: session.pendingConsent ?? null,
      pendingManualExecution: session.pendingManualExecution ?? null,
      shells: session.shells ?? [],
      // totalTokens here powers the context-usage widget; use latest prompt tokens
      // (current window usage), not cumulative lifetime spend.
      totalTokens: contextTokens,
      lifetimeTokens: session.totalTokens ?? 0,
      promptTokens: latestTokenSnapshot?.promptTokens ?? null,
      completionTokens: latestTokenSnapshot?.completionTokens ?? null,
      contextLimit,
      subagents: (session.subagents ?? []).map((s) => ({
        subagentId: s.subagentId,
        parentId: s.parentId,
        task: s.task,
        status: s.status,
        result: s.result,
        shells: s.shells,
        createdAt: s.createdAt,
        completedAt: s.completedAt,
      })),
      swarms: (session.swarms ?? []).map((sw) => ({
        swarmId: sw.swarmId,
        goal: sw.goal,
        winCondition: sw.winCondition,
        status: sw.status,
        winner: sw.winner,
        findings: sw.findings,
        createdAt: sw.createdAt,
        completedAt: sw.completedAt,
        agents: (sw.agents ?? []).map((a) => ({
          agentId: a.agentId,
          task: a.task,
          model: a.modelLabel,
          modelLabel: a.modelLabel,
          status: a.status,
          result: a.result,
          messages: a.messages,
          createdAt: a.createdAt,
          completedAt: a.completedAt,
        })),
      })),
      connectionState: session.connectionState ?? { sshConnected: false },
    });
  } catch (err: any) {
    console.error("[agent] getHistory error:", err);
    return res.status(500).json({ message: "Failed to get history" });
  }
};

export const getSessionInfo = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ message: "sessionId is required" });
    }

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    const ctfConfig = session.ctfConfig;
    const isCTF = !!ctfConfig?.ctfName;
    let ctf: Record<string, any> | undefined;

    if (isCTF) {
      const activeSolve = ctfConfig!.activeSolve as any;
      const solveHistory = (ctfConfig as any)?.solveHistory ?? [];
      const solve = solveHistory.find(
        (r: any) => r.challengeName === session.name,
      );

      ctf = {
        ctfName: ctfConfig!.ctfName,
        category: activeSolve?.category || solve?.category || null,
        points: activeSolve?.points ?? solve?.points ?? null,
        status: solve?.status || "pending",
        flag: solve?.confirmedFlag || null,
        submittedToCtfd: solve?.submittedToCtfd || false,
        flagFormat: ctfConfig!.flagFormat || null,
      };
    }

    return res.status(200).json({
      sessionId: session.sessionId,
      workspaceId: session.workspaceId,
      name: session.name,
      description: session.description,
      agentState: session.agentState,
      createdAt: session.createdAt,
      totalTokens: session.totalTokens,
      messageCount: session.messages.length,
      isCTF,
      ...(ctf ? { ctf } : {}),
    });
  } catch (err: any) {
    console.error("[agent] getSessionInfo error:", err);
    return res.status(500).json({ message: "Failed to get session info" });
  }
};

export const deleteSession = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ message: "sessionId is required" });
    }

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    session.status = "archived";
    await session.save();

    return res.status(200).json({ message: "Session deleted" });
  } catch (err: any) {
    console.error("[agent] deleteSession error:", err);
    return res.status(400).json({ message: "Failed to delete session" });
  }
};

export const clearContext = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ message: "sessionId is required" });

    const session = await SessionsModel.findOne({ sessionId });
    if (!session) return res.status(404).json({ message: "Session not found" });

    abortSession(sessionId);

    const systemMsg = session.messages?.find((m: any) => m.role === "system" && !m.isSummary);

    await SessionsModel.updateOne(
      { sessionId },
      {
        $set: {
          messages: systemMsg ? [systemMsg] : [],
          subagents: [],
          swarms: [],
          agentState: "idle",
          pendingConsent: null,
          pendingManualExecution: null,
          turnIndex: 0,
          totalTokens: 0,
          tokenHistory: [],
          "ctfConfig.activeSolve": null,
          "ctfConfig.solveHistory": [],
        },
      },
    );

    return res.status(200).json({ message: "Context cleared" });
  } catch (err: any) {
    console.error("[agent] clearContext error:", err);
    return res.status(400).json({ message: "Failed to clear context" });
  }
};

export const handleSlashCommand = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { sessionId, message } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ message: "sessionId and message are required" });
    }

    const parsed = parseSlashCommand(message);
    if (!parsed) {
      return res.status(400).json({ message: "Not a valid slash command" });
    }

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    const sse = createSSEWriter(res);

    await executeSlashCommand({
      sessionId,
      userId,
      command: parsed.command,
      args: parsed.args,
      sse,
    });
  } catch (err: any) {
    console.error("[agent] handleSlashCommand error:", err);
    if (!res.headersSent) {
      return res.status(500).json({ message: err.message ?? "Slash command error" });
    }
  }
};

export const getSlashCommands = async (_req: Request, res: Response) => {
  return res.status(200).json(SLASH_COMMANDS);
};

export const getSessionAgentToolsConfig = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ message: "sessionId is required" });
    }

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    const disabledTools: string[] = session.disabledAgentTools || [];
    const unconfigured = new Set(getUnconfiguredToolNames());
    const allTools = toolRegistry.getAll().map((t) => ({
      name: t.name,
      description: t.description,
      enabled: !disabledTools.includes(t.name),
      configured: !unconfigured.has(t.name),
    }));

    return res.status(200).json({ tools: allTools });
  } catch (err: any) {
    console.error("[agent] getSessionAgentToolsConfig error:", err);
    return res.status(400).json({ message: "Failed to get agent tools config" });
  }
};

export const updateSessionAgentToolsConfig = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { sessionId } = req.params;
    const { disabledTools } = req.body;

    if (!sessionId) {
      return res.status(400).json({ message: "sessionId is required" });
    }

    if (!Array.isArray(disabledTools)) {
      return res.status(400).json({ message: "disabledTools must be an array" });
    }

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    session.disabledAgentTools = disabledTools;
    await session.save();

    return res.status(200).json({ message: "Agent tools config updated" });
  } catch (err: any) {
    console.error("[agent] updateSessionAgentToolsConfig error:", err);
    return res.status(400).json({ message: "Failed to update agent tools config" });
  }
};

export const getUserSessions = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;

    const sessions = await SessionsModel.find({
      uid: user._id,
      status: { $ne: "archived" },
    })
      .select("sessionId workspaceId name description createdAt agentState totalTokens")
      .sort({ createdAt: -1 });

    return res.status(200).json(sessions);
  } catch (err: any) {
    console.error("[agent] getUserSessions error:", err);
    return res.status(400).json({ message: "Failed to get sessions" });
  }
};

export const installCapability = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { sessionId, capabilityName } = req.body;

    if (!sessionId || !capabilityName) {
      return res.status(400).json({ message: "sessionId and capabilityName are required" });
    }

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    const cap = getCapabilityByName(capabilityName);
    if (!cap) {
      return res.status(400).json({ message: `Unknown capability: "${capabilityName}"` });
    }

    const shellManager = await sessionLifecycle.getShellManager(sessionId);
    if (!shellManager.isConnected) {
      try { await shellManager.connect(); } catch {
        return res.status(500).json({ message: "Cannot connect to attack box" });
      }
    }

    const { output, exitCode } = await shellManager.execInShell(cap.installCommand, 120_000);

    return res.status(200).json({
      success: exitCode === 0,
      output,
      exitCode,
      capability: { name: cap.name, label: cap.label },
    });
  } catch (err: any) {
    console.error("[agent] installCapability error:", err);
    return res.status(500).json({ message: err.message ?? "Install failed" });
  }
};
