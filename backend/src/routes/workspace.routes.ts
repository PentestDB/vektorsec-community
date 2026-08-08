import express from "express";
import { verifySess } from "../middlewares/VerifySession.middleware";
import {
  createWorkspace,
  getUserWorkspaces,
  getWorkspaceDetail,
  deleteWorkspace,
  createSessionInWorkspace,
  getWorkspaceWorkHost,
  updateWorkspaceWorkHost,
  testWorkspaceWorkHost,
  listWorkspaceWorkHostDirectories,
} from "../controllers/workspace.controller";

const router = express.Router();

router.post("/create", [verifySess], createWorkspace);
router.post("/list", [verifySess], getUserWorkspaces);
router.get("/:workspaceId/work-host", [verifySess], getWorkspaceWorkHost);
router.put("/:workspaceId/work-host", [verifySess], updateWorkspaceWorkHost);
router.post("/:workspaceId/work-host/test", [verifySess], testWorkspaceWorkHost);
router.post("/:workspaceId/work-host/directories", [verifySess], listWorkspaceWorkHostDirectories);
router.get("/:workspaceId", [verifySess], getWorkspaceDetail);
router.post("/delete", [verifySess], deleteWorkspace);
router.post("/:workspaceId/create-session", [verifySess], createSessionInWorkspace);

export { router as workspaceRoutes };
