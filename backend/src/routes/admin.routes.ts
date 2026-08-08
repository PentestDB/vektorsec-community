import { Router } from "express";
import { verifyAdmin } from "../middlewares/VerifyAdmin.middleware";
import {
  getDashboardStats,
  listUsers,
  blockUser,
  unblockUser,
  updateUserRole,
  updateUserPlan,
  deleteUser,
  resetUserPassword,
  getReports,
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  listAuditLogs,
  getSystemSettings,
  updateSystemSettings,
  listAllMcpTokens,
  createUserMcpToken,
  setUserMcpTokenLimit,
  revokeUserMcpToken,
  getScopeConfig,
  updateScopeConfig,
  getApiKeys,
  updateApiKeys,
  clearApiKey,
} from "../controllers/admin.controller";

import {
  getTelegramStatus,
  testTelegramConnection,
  setTelegramWebhookHandler,
  broadcastToTelegramUsers,
  listTelegramUsersAdmin,
  saveTelegramBotToken,
  startTelegramBotHandler,
  stopTelegramBotHandler,
  getTelegramCommands,
  getActiveTasks,
  abortSessionHandler,
  cancelQueuedTask,
  getSystemResource,
  getExecutionLogs,
  getExecutionQuotas,
  updateExecutionQuotas,
  getPentestAnalytics,
  getSystemHealth,
  getNotificationLogs,
} from "../controllers/adminInfra.controller";

const router = Router();

// All admin routes require admin role
router.use(verifyAdmin);

// Dashboard
router.get("/dashboard", getDashboardStats);

// User management
router.get("/users", listUsers);
router.post("/users/:userId/block", blockUser);
router.post("/users/:userId/unblock", unblockUser);
router.put("/users/:userId/role", updateUserRole);
router.put("/users/:userId/plan", updateUserPlan);
router.post("/users/:userId/reset-password", resetUserPassword);
router.delete("/users/:userId", deleteUser);

// Reports
router.get("/reports", getReports);

// Coupons
router.get("/coupons", listCoupons);
router.post("/coupons", createCoupon);
router.put("/coupons/:couponId", updateCoupon);
router.delete("/coupons/:couponId", deleteCoupon);

// Audit logs
router.get("/audit-logs", listAuditLogs);

// System settings
router.get("/settings", getSystemSettings);
router.put("/settings", updateSystemSettings);

// MCP token management
router.get("/mcp-tokens", listAllMcpTokens);
router.post("/users/:userId/mcp-tokens", createUserMcpToken);
router.put("/users/:userId/mcp-token-limit", setUserMcpTokenLimit);
router.post("/users/:userId/mcp-tokens/:tokenId/revoke", revokeUserMcpToken);

// ─── Infra monitor (Telegram bot, active tasks, system resources) ──
router.get("/infra/telegram", getTelegramStatus);
router.post("/infra/telegram/test", testTelegramConnection);
router.post("/infra/telegram/webhook", setTelegramWebhookHandler);
router.post("/infra/telegram/broadcast", broadcastToTelegramUsers);
router.get("/infra/telegram/users", listTelegramUsersAdmin);
router.post("/infra/telegram/token", saveTelegramBotToken);
router.post("/infra/telegram/start", startTelegramBotHandler);
router.post("/infra/telegram/stop", stopTelegramBotHandler);
router.get("/infra/telegram/commands", getTelegramCommands);

router.get("/infra/tasks", getActiveTasks);
router.post("/infra/sessions/:sessionId/abort", abortSessionHandler);
router.post("/infra/queue/:taskId/cancel", cancelQueuedTask);

router.get("/infra/system", getSystemResource);

// ─── System Health + Notification Logs ─────────────────────────────
router.get("/infra/health", getSystemHealth);
router.get("/infra/notifications", getNotificationLogs);

// ─── Execution Logs ─────────────────────────────────────────────────
router.get("/infra/executions", getExecutionLogs);

// ─── Execution Quotas / Rate Limits (per plan) ─────────────────────
router.get("/infra/quotas", getExecutionQuotas);
router.put("/infra/quotas/:planId", updateExecutionQuotas);

// ─── Pentest Analytics ─────────────────────────────────────────────
router.get("/infra/analytics", getPentestAnalytics);

// ─── Scope / Whitelist Management ───────────────────────────────────
router.get("/scope", getScopeConfig);
router.put("/scope", updateScopeConfig);

// ─── API Keys / Provider Settings ───────────────────────────────────
router.get("/api-keys", getApiKeys);
router.put("/api-keys", updateApiKeys);
router.post("/api-keys/clear", clearApiKey);

export default router;
