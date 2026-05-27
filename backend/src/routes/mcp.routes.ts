import express from "express";
import { verifySess } from "../middlewares/VerifySession.middleware";
import {
  createMcpAccessToken,
  getMcpConfig,
  revokeMcpAccessToken,
} from "../controllers/mcp.controller";

const router = express.Router();

router.get("/config", [verifySess], getMcpConfig);
router.post("/tokens", [verifySess], createMcpAccessToken);
router.delete("/tokens/:tokenId", [verifySess], revokeMcpAccessToken);

export { router as mcpRoutes };
