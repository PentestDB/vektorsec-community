import express from "express";
import { verifySess } from "../middlewares/VerifySession.middleware";
import {
  getBurpProxyHistory,
  sendBurpRequest,
  sendToRepeater,
} from "../controllers/burp.controller";

const router = express.Router();

router.get("/proxy-history", [verifySess], getBurpProxyHistory);
router.post("/send-request", [verifySess], sendBurpRequest);
router.post("/send-to-repeater", [verifySess], sendToRepeater);

export { router as burpRoutes };
