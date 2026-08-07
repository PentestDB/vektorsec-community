import express from "express";
import { verifySess } from "../middlewares/VerifySession.middleware";
import {
  createTask,
  getCallbackDetail,
  getConnectionStatus,
  getHealth,
  getTaskDetail,
  listC2Profiles,
  listCallbackTasks,
  listCallbacks,
  listCredentials,
  listFiles,
  listPayloads,
  listPorts,
  listTasks,
} from "../controllers/mythic.controller";

const router = express.Router();

router.get("/health", getHealth);
router.get("/connection-status", [verifySess], getConnectionStatus);
router.get("/callbacks", [verifySess], listCallbacks);
router.get("/callbacks/:displayId", [verifySess], getCallbackDetail);
router.get("/callbacks/:displayId/tasks", [verifySess], listCallbackTasks);
router.get("/tasks", [verifySess], listTasks);
router.post("/task", [verifySess], createTask);
router.get("/task/:displayId", [verifySess], getTaskDetail);
router.get("/ports", [verifySess], listPorts);
router.get("/payloads", [verifySess], listPayloads);
router.get("/c2-profiles", [verifySess], listC2Profiles);
router.get("/credentials", [verifySess], listCredentials);
router.get("/files", [verifySess], listFiles);

export { router as mythicRoutes };
