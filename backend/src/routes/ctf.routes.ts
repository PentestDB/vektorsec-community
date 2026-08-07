import express from "express";
import { verifySess } from "../middlewares/VerifySession.middleware";
import {
  connectCtf,
  getCtfConfig,
  syncCtf,
  disconnectCtf,
  reauthCtf,
  getCtfChallenges,
  submitFlag,
  setFlagFormat,
  startSolvingAll,
} from "../controllers/ctf.controller";

const router = express.Router();

router.post("/:workspaceId/connect", [verifySess], connectCtf);
router.patch("/:workspaceId/reauth", [verifySess], reauthCtf);
router.get("/:workspaceId/config", [verifySess], getCtfConfig);
router.get("/:workspaceId/challenges", [verifySess], getCtfChallenges);
router.post("/:workspaceId/sync", [verifySess], syncCtf);
router.post("/:workspaceId/submit-flag", [verifySess], submitFlag);
router.post("/:workspaceId/solve-all", [verifySess], startSolvingAll);
router.patch("/:workspaceId/flag-format", [verifySess], setFlagFormat);
router.post("/:workspaceId/disconnect", [verifySess], disconnectCtf);

export { router as ctfRoutes };
