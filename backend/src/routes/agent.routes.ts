import express from "express";
import { verifySess } from "../middlewares/VerifySession.middleware";
import {
  createSession,
  sendMessage,
  pauseAgent,
  resumeAgent,
  respondToConsent,
  submitManualOutput,
  getHistory,
  getSessionInfo,
  deleteSession,
  getUserSessions,
} from "../controllers/agent.controller";

const router = express.Router();

router.post("/create-session", [verifySess], createSession);
router.post("/sessions", [verifySess], getUserSessions);
router.get("/session/:sessionId", [verifySess], getSessionInfo);
router.get("/session/:sessionId/history", [verifySess], getHistory);
router.post("/delete-session", [verifySess], deleteSession);

router.post("/message", [verifySess], sendMessage);
router.post("/pause", [verifySess], pauseAgent);
router.post("/resume", [verifySess], resumeAgent);
router.post("/consent", [verifySess], respondToConsent);
router.post("/manual-output", [verifySess], submitManualOutput);

export { router as agentRoutes };
