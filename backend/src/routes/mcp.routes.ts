import express from "express";
import { verifySess } from "../middlewares/VerifySession.middleware";
import { enforceUsageLimit } from "../middlewares/UsageLimit.middleware";
import {
  createMcpAccessToken,
  getMcpConfig,
  revokeMcpAccessToken,
  updateMcpSafety,
} from "../controllers/mcp.controller";

const router = express.Router();

router.get("/config", [verifySess], getMcpConfig);
router.post("/safety", [verifySess], updateMcpSafety);
router.post("/tokens", [verifySess, enforceUsageLimit("mcp_tokens")], createMcpAccessToken);
router.delete("/tokens/:tokenId", [verifySess], revokeMcpAccessToken);

export { router as mcpRoutes };
