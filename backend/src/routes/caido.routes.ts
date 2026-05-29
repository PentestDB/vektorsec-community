import express from "express";
import { verifySess } from "../middlewares/VerifySession.middleware";
import {
  getCaidoConnectionStatus,
  getCaidoHealthController,
  getCaidoHttpEntry,
  getCaidoHttpHistory,
  getCaidoInterceptStatus,
  sendCaidoRequest,
  sendToCaidoAutomate,
  sendToCaidoReplay,
  setCaidoIntercept,
} from "../controllers/caido.controller";

const router = express.Router();

router.get("/health", getCaidoHealthController);
router.get("/connection-status", [verifySess], getCaidoConnectionStatus);
router.get("/http-history", [verifySess], getCaidoHttpHistory);
router.get("/http-entry/:id", [verifySess], getCaidoHttpEntry);
router.post("/send-request", [verifySess], sendCaidoRequest);
router.post("/send-to-replay", [verifySess], sendToCaidoReplay);
router.post("/send-to-automate", [verifySess], sendToCaidoAutomate);
router.post("/replay-send", [verifySess], sendCaidoRequest);
router.get("/intercept-status", [verifySess], getCaidoInterceptStatus);
router.post("/proxy/set-intercept", [verifySess], setCaidoIntercept);

export { router as caidoRoutes };
