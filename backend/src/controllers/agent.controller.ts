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
} from "../services/agent.service";

export const createSession = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Session name is required" });
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
      name: name.length > 50 ? name.substring(0, 50) + "..." : name,
      description: description?.substring(0, 500) ?? "",
      createdAt: new Date(),
    });
    await session.save();

    return res.status(200).json({ sessionId, message: "Session created" });
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
      return res.status(409).json({ message: "Agent is already running" });
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
      return res.status(409).json({ message: "Agent is already running" });
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

    return res.status(200).json({
      messages: session.messages,
      agentState: session.agentState,
      turnIndex: session.turnIndex,
      pendingConsent: session.pendingConsent ?? null,
      pendingManualExecution: session.pendingManualExecution ?? null,
      shells: session.shells ?? [],
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

    return res.status(200).json({
      sessionId: session.sessionId,
      name: session.name,
      description: session.description,
      agentState: session.agentState,
      createdAt: session.createdAt,
      totalTokens: session.totalTokens,
      messageCount: session.messages.length,
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

    const systemMsg = session.messages?.find((m: any) => m.role === "system" && !m.isSummary);

    await SessionsModel.updateOne(
      { sessionId },
      {
        $set: {
          messages: systemMsg ? [systemMsg] : [],
          subagents: [],
          agentState: "idle",
          pendingConsent: null,
          pendingManualExecution: null,
        },
      },
    );

    return res.status(200).json({ message: "Context cleared" });
  } catch (err: any) {
    console.error("[agent] clearContext error:", err);
    return res.status(400).json({ message: "Failed to clear context" });
  }
};

export const getUserSessions = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;

    const sessions = await SessionsModel.find({
      uid: user._id,
      status: { $ne: "archived" },
    })
      .select("sessionId name description createdAt agentState totalTokens")
      .sort({ createdAt: -1 });

    return res.status(200).json(sessions);
  } catch (err: any) {
    console.error("[agent] getUserSessions error:", err);
    return res.status(400).json({ message: "Failed to get sessions" });
  }
};
