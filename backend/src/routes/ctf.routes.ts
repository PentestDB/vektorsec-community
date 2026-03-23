import express from "express";
import { verifySess } from "../middlewares/VerifySession.middleware";
import {
  connectCtf,
  getCtfConfig,
  syncCtf,
  disconnectCtf,
  getCtfChallenges,
} from "../controllers/ctf.controller";

const router = express.Router();

router.post("/:sessionId/connect", [verifySess], connectCtf);
router.get("/:sessionId/config", [verifySess], getCtfConfig);
router.get("/:sessionId/challenges", [verifySess], getCtfChallenges);
router.post("/:sessionId/sync", [verifySess], syncCtf);
router.post("/:sessionId/disconnect", [verifySess], disconnectCtf);

export { router as ctfRoutes };
