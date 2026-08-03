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
  clearContext,
  handleSlashCommand,
  getSlashCommands,
  getSessionAgentToolsConfig,
  updateSessionAgentToolsConfig,
  installCapability,
} from "../controllers/agent.controller";
import {
  chatAboutVulnerability,
  getVulnerabilities,
  getVulnerability,
} from "../controllers/vulnerability.controller";

const router = express.Router();

router.post("/create-session", [verifySess], createSession);
router.post("/sessions", [verifySess], getUserSessions);
router.get("/session/:sessionId", [verifySess], getSessionInfo);
router.get("/session/:sessionId/history", [verifySess], getHistory);
router.get("/session/:sessionId/agent-tools-config", [verifySess], getSessionAgentToolsConfig);
router.post("/session/:sessionId/agent-tools-config", [verifySess], updateSessionAgentToolsConfig);
router.get("/session/:sessionId/vulnerabilities", [verifySess], getVulnerabilities);
router.get("/session/:sessionId/vulnerabilities/:vulnerabilityId", [verifySess], getVulnerability);
router.post("/session/:sessionId/vulnerabilities/:vulnerabilityId/chat", [verifySess], chatAboutVulnerability);
router.post("/delete-session", [verifySess], deleteSession);

router.post("/message", [verifySess], sendMessage);
router.post("/pause", [verifySess], pauseAgent);
router.post("/resume", [verifySess], resumeAgent);
router.post("/consent", [verifySess], respondToConsent);
router.post("/manual-output", [verifySess], submitManualOutput);
router.post("/clear-context", [verifySess], clearContext);
router.post("/slash-command", [verifySess], handleSlashCommand);
router.get("/slash-commands", [verifySess], getSlashCommands);
router.post("/install-capability", [verifySess], installCapability);

export { router as agentRoutes };
