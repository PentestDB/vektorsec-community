import express from "express";
import { verifySess } from "../middlewares/VerifySession.middleware";
import {
  getBurpProxyHistory,
  getBurpProxyEntry,
  sendBurpRequest,
  sendToRepeater,
  sendToIntruder,
  sendAndReceiveRepeater,
  generateCollaboratorPayload,
  pollCollaborator,
  getProxyInterceptStatus,
  setProxyIntercept,
} from "../controllers/burp.controller";

const router = express.Router();

router.get("/proxy-history", [verifySess], getBurpProxyHistory);
router.get("/proxy-entry/:id", [verifySess], getBurpProxyEntry);
router.post("/send-request", [verifySess], sendBurpRequest);
router.post("/send-to-repeater", [verifySess], sendToRepeater);
router.post("/send-to-intruder", [verifySess], sendToIntruder);
router.post("/repeater-send", [verifySess], sendAndReceiveRepeater);
router.post("/collaborator/generate", [verifySess], generateCollaboratorPayload);
router.post("/collaborator/poll", [verifySess], pollCollaborator);
router.get("/proxy/intercept-status", [verifySess], getProxyInterceptStatus);
router.post("/proxy/set-intercept", [verifySess], setProxyIntercept);

export { router as burpRoutes };
