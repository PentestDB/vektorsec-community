/**
 * Legacy session controller — gutted.
 * All agentic endpoints now live in agent.controller.ts under /api/agent/*.
 * These stubs exist only to prevent route registration errors from session.routes.ts
 * during the transition period.
 */

import { Response, Request } from "express";

const stub = (_req: Request, res: Response) =>
  res.status(410).json({ message: "This endpoint has been replaced. Use /api/agent/* instead." });

export const initiateCopilotSession = stub;
export const generateCopilotCommand = stub;
export const finalizeCopilotCommand = stub;
export const storeToolOutputData = stub;
export const generateLoopSummary = stub;
export const finalizeSummary = stub;
export const undoPreviousStep = stub;
export const takeActionOnResponse = stub;
export const uploadAnalysisFile = stub;
export const followGoogleTarget = stub;
export const agenticContinueHandler = stub;
export const analyzeAllSubprocessData = stub;

export {
  generateLoopSummary as generateSummary,
  followGoogleTarget as followTarget,
};
