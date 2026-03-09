/**
 * Copilot controller — session CRUD and download functionality.
 * The agentic loop endpoints live in agent.controller.ts.
 */

import { Response, Request } from "express";
import { v4 as uuidv4 } from "uuid";
import SessionsModel from "../models/Sessions/Sessions.model";
import HistoryArchiveModel from "../models/HistoryArchive/HistoryArchive.model";
import { requireActiveSession } from "../services/session.helpers";

export const createCopilotSession = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Session details missing" });
    }

    const sessionId = uuidv4();

    const archiveHistory = new HistoryArchiveModel({ sessionId, history: [] });
    await archiveHistory.save();

    const newSession = new SessionsModel({
      name: name.length > 50 ? name.substring(0, 50) + "..." : name,
      description: description?.length > 500 ? description.substring(0, 500) : description ?? "",
      uid: userId,
      createdAt: new Date(),
      sessionId,
    });

    await newSession.save();

    return res.status(200).json({ message: "Workspace created", sessionId });
  } catch (err) {
    console.error("Error creating workspace:", err);
    return res.status(400).json({ message: "Failed to create workspace" });
  }
};

export const getCopilotSession = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body;
    const userId = res.locals.userId;

    if (!session_id) {
      return res.status(400).json({ message: "Session ID not found" });
    }

    const dbSession = await requireActiveSession(userId, session_id, res);
    if (!dbSession) return;

    return res.status(200).json({
      message: "Session data",
      sessionId: dbSession.sessionId,
      agentState: dbSession.agentState,
      messageCount: dbSession.messages.length,
    });
  } catch (err) {
    console.error("Error getting session:", err);
    return res.status(400).json({ message: "Failed to get session" });
  }
};

export const deleteCopilotSession = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body;
    const userId = res.locals.userId;

    if (!session_id) {
      return res.status(400).json({ message: "Session ID not found" });
    }

    const session = await requireActiveSession(userId, session_id, res);
    if (!session) return;

    session.status = "archived";
    await session.save();

    return res.status(200).json({ message: "Session deleted successfully" });
  } catch (err) {
    console.error("Error deleting session:", err);
    return res.status(400).json({ message: "Failed to delete session" });
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
  } catch (err) {
    console.error("Error getting sessions:", err);
    return res.status(400).json({ message: "Failed to get user sessions" });
  }
};

export const getSessionInfo = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body;
    const userId = res.locals.userId;

    if (!session_id) {
      return res.status(400).json({ message: "Session not found" });
    }

    const session = await requireActiveSession(userId, session_id, res);
    if (!session) return;

    return res.status(200).json({
      sessionName: session.name,
      sessionId: session.sessionId,
    });
  } catch (err) {
    console.error("Error getting session info:", err);
    return res.status(400).json({ message: "Failed to get session info" });
  }
};

export const getSessionHistory = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body;
    const userId = res.locals.userId;

    if (!session_id) {
      return res.status(400).json({ message: "Session not found" });
    }

    const dbSession = await requireActiveSession(userId, session_id, res);
    if (!dbSession) return;

    return res.status(200).json({
      messages: dbSession.messages,
      agentState: dbSession.agentState,
    });
  } catch (err) {
    console.error("Error getting session history:", err);
    return res.status(400).json({ message: "Failed to get session history" });
  }
};

// Stubs for removed features
export const createCopilotSubprocess = async (_req: Request, res: Response) =>
  res.status(410).json({ message: "Subprocesses replaced by parallel tool calls" });

export const completeCopilotSubprocess = async (_req: Request, res: Response) =>
  res.status(410).json({ message: "Subprocesses replaced by parallel tool calls" });

export const getTodoListSession = async (_req: Request, res: Response) =>
  res.status(410).json({ message: "Todo list replaced by agentic planning" });

export const updateTodoListSession = async (_req: Request, res: Response) =>
  res.status(410).json({ message: "Todo list replaced by agentic planning" });

export const downloadCommandFiles = async (_req: Request, res: Response) =>
  res.status(410).json({ message: "Download not yet available in new agent system" });
