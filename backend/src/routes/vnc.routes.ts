import express from "express";
import { verifySess } from "../middlewares/VerifySession.middleware";
import { getVNCCredentials } from "../controllers/vnc.controller";

const router = express.Router();

router.post("/connect-vnc", [verifySess], getVNCCredentials);

export { router as vncRoutes };
