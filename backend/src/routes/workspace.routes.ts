import express from "express";
import { verifySess } from "../middlewares/VerifySession.middleware";
import {
  createWorkspace,
  getUserWorkspaces,
  getWorkspaceDetail,
  deleteWorkspace,
  createSessionInWorkspace,
} from "../controllers/workspace.controller";

const router = express.Router();

router.post("/create", [verifySess], createWorkspace);
router.post("/list", [verifySess], getUserWorkspaces);
router.get("/:workspaceId", [verifySess], getWorkspaceDetail);
router.post("/delete", [verifySess], deleteWorkspace);
router.post("/:workspaceId/create-session", [verifySess], createSessionInWorkspace);

export { router as workspaceRoutes };
