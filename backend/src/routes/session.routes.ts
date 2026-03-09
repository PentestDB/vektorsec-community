import express from "express";
import { verifySess } from "../middlewares/VerifySession.middleware";
import {
  analyzeAllSubprocessData,
  finalizeCopilotCommand,
  generateCopilotCommand,
  generateLoopSummary,
  initiateCopilotSession,
  finalizeSummary,
  storeToolOutputData,
  undoPreviousStep,
  takeActionOnResponse,
  uploadAnalysisFile,
  followGoogleTarget,
  agenticContinueHandler,
} from "../controllers/session.controller";
import { uploadMiddleware } from "../middlewares/MulterMiddleware";

const router = express.Router();

router.post("/init-pentest", [verifySess], initiateCopilotSession);

router.post("/generate-command", [verifySess], generateCopilotCommand);

router.post("/finalize-command", [verifySess], finalizeCopilotCommand);

router.post("/store-command-output", [verifySess], storeToolOutputData);

router.post("/generate-summary", [verifySess], generateLoopSummary);

router.post("/finalize-summary", [verifySess], finalizeSummary);

router.post("/analyze-all-subprocess", [verifySess], analyzeAllSubprocessData);

router.post("/undo-previous-step", [verifySess], undoPreviousStep);

router.post("/response-actions", [verifySess], takeActionOnResponse);

router.post("/follow-target", [verifySess], followGoogleTarget);

router.post("/agentic-continue", [verifySess], agenticContinueHandler);

router.post(
  "/upload-analysis-file",
  [verifySess, uploadMiddleware.single("file")],
  uploadAnalysisFile
);

export { router as sessionRoutes };
