import { Request, Response } from "express";
import {
  MythicError,
  getC2Profiles,
  getCallback,
  getCallbackPorts,
  getCallbacks,
  getCredentials,
  getFiles,
  getMythicHealth,
  getPayloads,
  getTask,
  getTaskOutput,
  getTasks,
  isMythicConfigured,
  issueTask,
} from "../services/mythic.client";

/**
 * REST surface backing the Mythic session page. Thin pass-throughs to the same
 * client the agent tools use — no C2 state is stored on this side.
 */

function fail(res: Response, err: any) {
  if (err instanceof MythicError) {
    const status = err.kind === "unauthorized" ? 401 : err.kind === "unreachable" ? 502 : 400;
    return res.status(status).json({ message: err.message, kind: err.kind });
  }
  console.log(err);
  return res.status(500).json({ message: "Mythic request failed" });
}

function requireConfigured(res: Response): boolean {
  if (isMythicConfigured()) return true;
  res.status(400).json({ message: "Mythic C2 is not configured.", kind: "unconfigured" });
  return false;
}

/** Unauthenticated, always 200 — the UI polls this for a connection badge. */
export const getHealth = async (_req: Request, res: Response) => {
  const health = await getMythicHealth();
  return res.status(200).json(health);
};

export const getConnectionStatus = async (_req: Request, res: Response) => {
  const health = await getMythicHealth();
  return res.status(200).json(health);
};

export const listCallbacks = async (req: Request, res: Response) => {
  if (!requireConfigured(res)) return;
  try {
    const callbacks = await getCallbacks({
      activeOnly: req.query.includeInactive !== "true",
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    return res.status(200).json({ callbacks });
  } catch (err) {
    return fail(res, err);
  }
};

export const getCallbackDetail = async (req: Request, res: Response) => {
  if (!requireConfigured(res)) return;
  try {
    const displayId = Number(req.params.displayId);
    if (!Number.isInteger(displayId)) {
      return res.status(400).json({ message: "Invalid callback display id" });
    }
    const callback = await getCallback(displayId);
    if (!callback) return res.status(404).json({ message: "Callback not found" });
    const ports = await getCallbackPorts(displayId);
    return res.status(200).json({ callback, ports });
  } catch (err) {
    return fail(res, err);
  }
};

export const listCallbackTasks = async (req: Request, res: Response) => {
  if (!requireConfigured(res)) return;
  try {
    const displayId = Number(req.params.displayId);
    if (!Number.isInteger(displayId)) {
      return res.status(400).json({ message: "Invalid callback display id" });
    }
    const tasks = await getTasks({
      callbackDisplayId: displayId,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    return res.status(200).json({ tasks });
  } catch (err) {
    return fail(res, err);
  }
};

export const listTasks = async (req: Request, res: Response) => {
  if (!requireConfigured(res)) return;
  try {
    const tasks = await getTasks({ limit: req.query.limit ? Number(req.query.limit) : undefined });
    return res.status(200).json({ tasks });
  } catch (err) {
    return fail(res, err);
  }
};

/** Manual tasking from the session page's console. */
export const createTask = async (req: Request, res: Response) => {
  if (!requireConfigured(res)) return;
  try {
    const callbackDisplayId = Number(req.body?.callbackDisplayId);
    const command = String(req.body?.command || "").trim();
    if (!Number.isInteger(callbackDisplayId) || !command) {
      return res.status(400).json({ message: "callbackDisplayId and command are required" });
    }
    const result = await issueTask({
      callbackDisplayId,
      command,
      params: typeof req.body?.params === "string" ? req.body.params : undefined,
    });
    return res.status(200).json(result);
  } catch (err) {
    return fail(res, err);
  }
};

export const getTaskDetail = async (req: Request, res: Response) => {
  if (!requireConfigured(res)) return;
  try {
    const displayId = Number(req.params.displayId);
    if (!Number.isInteger(displayId)) {
      return res.status(400).json({ message: "Invalid task display id" });
    }
    const [task, output] = await Promise.all([getTask(displayId), getTaskOutput(displayId)]);
    if (!task) return res.status(404).json({ message: "Task not found" });
    return res.status(200).json({ task, output });
  } catch (err) {
    return fail(res, err);
  }
};

export const listPorts = async (req: Request, res: Response) => {
  if (!requireConfigured(res)) return;
  try {
    const callbackDisplayId = req.query.callbackDisplayId
      ? Number(req.query.callbackDisplayId)
      : undefined;
    const ports = await getCallbackPorts(callbackDisplayId);
    return res.status(200).json({ ports });
  } catch (err) {
    return fail(res, err);
  }
};

export const listPayloads = async (_req: Request, res: Response) => {
  if (!requireConfigured(res)) return;
  try {
    const payloads = await getPayloads();
    return res.status(200).json({ payloads });
  } catch (err) {
    return fail(res, err);
  }
};

export const listC2Profiles = async (_req: Request, res: Response) => {
  if (!requireConfigured(res)) return;
  try {
    const profiles = await getC2Profiles();
    return res.status(200).json({ profiles });
  } catch (err) {
    return fail(res, err);
  }
};

export const listCredentials = async (_req: Request, res: Response) => {
  if (!requireConfigured(res)) return;
  try {
    const credentials = await getCredentials();
    return res.status(200).json({ credentials });
  } catch (err) {
    return fail(res, err);
  }
};

export const listFiles = async (req: Request, res: Response) => {
  if (!requireConfigured(res)) return;
  try {
    const files = await getFiles({
      callbackDisplayId: req.query.callbackDisplayId ? Number(req.query.callbackDisplayId) : undefined,
    });
    return res.status(200).json({ files });
  } catch (err) {
    return fail(res, err);
  }
};
