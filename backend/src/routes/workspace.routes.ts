import express from "express";
import { verifySess } from "../middlewares/VerifySession.middleware";
import { enforceUsageLimit } from "../middlewares/UsageLimit.middleware";
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
  getWorkspaceAgentConfig,
  updateWorkspaceAgentConfig,
  getWorkspaceOverview,
  exportWorkspaceReport,
} from "../controllers/workspace.controller";

const router = express.Router();

router.post("/create", [verifySess, enforceUsageLimit("workspaces")], createWorkspace);
router.post("/list", [verifySess], getUserWorkspaces);
router.get("/:workspaceId/work-host", [verifySess], getWorkspaceWorkHost);
router.put("/:workspaceId/work-host", [verifySess], updateWorkspaceWorkHost);
router.post("/:workspaceId/work-host/test", [verifySess], testWorkspaceWorkHost);
router.post("/:workspaceId/work-host/directories", [verifySess], listWorkspaceWorkHostDirectories);
router.get("/:workspaceId/overview", [verifySess], getWorkspaceOverview);
router.get("/:workspaceId/report", [verifySess], exportWorkspaceReport);
router.get("/:workspaceId", [verifySess], getWorkspaceDetail);
router.get("/:workspaceId/agent-config", [verifySess], getWorkspaceAgentConfig);
router.put("/:workspaceId/agent-config", [verifySess], updateWorkspaceAgentConfig);
router.post("/delete", [verifySess], deleteWorkspace);
router.post(
  "/:workspaceId/create-session",
  [verifySess, enforceUsageLimit(["concurrent_sessions", "sessions"])],
  createSessionInWorkspace,
);

export { router as workspaceRoutes };
