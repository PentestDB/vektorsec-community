import express from "express";
import { verifySess } from "../middlewares/VerifySession.middleware";
import { initiateNetcat, getNetcatData, startNetcat, sendNetcatInput, getNetcatOutput, stopNetcat } from "../controllers/netcat.controller";

const router = express.Router();
router.post("/initiate-netcat", [verifySess], initiateNetcat);
router.post("/netcat-data", [verifySess], getNetcatData);
router.post("/start-netcat", [verifySess], startNetcat);
router.post("/send-netcat-input", [verifySess], sendNetcatInput);
router.post("/get-netcat-output", [verifySess], getNetcatOutput);
router.post("/stop-netcat", [verifySess], stopNetcat);
export { router as netcatRoutes };
