/**
 * Legacy session services — gutted.
 * All agentic logic now lives in agent.service.ts.
 * This file only re-exports types and keeps createNewSession for the copilot controller.
 */

import { v4 as uuidv4 } from "uuid";
import SessionsModel from "../models/Sessions/Sessions.model";
import HistoryArchiveModel from "../models/HistoryArchive/HistoryArchive.model";

export { type AgentMessageDoc as HistoryData } from "../models/Sessions/Sessions.model";

export const createNewSession = async ({ uid }: { uid: string }) => {
  const sessionId = uuidv4();

  const archive = new HistoryArchiveModel({ sessionId, history: [] });
  await archive.save();

  return sessionId;
};

export const initNetcatSession = async (_sessionId: string) => {
  return { success: true };
};
