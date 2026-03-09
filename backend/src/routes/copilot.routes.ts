import express from "express";
import { verifySess } from "../middlewares/VerifySession.middleware";
import {
  completeCopilotSubprocess,
  createCopilotSession,
  createCopilotSubprocess,
  getCopilotSession,
  getUserSessions,
  getSessionInfo,
  downloadCommandFiles,
  getSessionHistory,
  deleteCopilotSession,
} from "../controllers/copilot.controller";

const router = express.Router();

router.post("/create-session", [verifySess], createCopilotSession);

router.post("/get-user-sessions", [verifySess], getUserSessions);

router.post("/get-session-info", [verifySess], getSessionInfo);

router.post("/get-session", [verifySess], getCopilotSession);

router.post("/get-session-history", [verifySess], getSessionHistory);

router.post("/create-subprocess", [verifySess], createCopilotSubprocess);

router.post("/complete-subprocess", [verifySess], completeCopilotSubprocess);

router.post("/delete-session", [verifySess], deleteCopilotSession);

// Command Files
router.post("/download", [verifySess], downloadCommandFiles);

export { router as copilotRoutes };
