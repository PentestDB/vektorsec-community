import { apiClient } from "@/utils/axios.config";

// Dashboard
export const getDashboardStats = async () => {
  const response = await apiClient.get("/admin/dashboard");
  return response.data;
};

// Users
export const getUsers = async (params = {}) => {
  const response = await apiClient.get("/admin/users", { params });
  return response.data;
};

export const blockUser = async (userId, reason) => {
  const response = await apiClient.post(`/admin/users/${userId}/block`, { reason });
  return response.data;
};

export const unblockUser = async (userId) => {
  const response = await apiClient.post(`/admin/users/${userId}/unblock`);
  return response.data;
};

export const updateUserRole = async (userId, role) => {
  const response = await apiClient.put(`/admin/users/${userId}/role`, { role });
  return response.data;
};

export const updateUserPlan = async (userId, plan, planExpiresAt) => {
  const response = await apiClient.put(`/admin/users/${userId}/plan`, { plan, planExpiresAt });
  return response.data;
};

export const resetUserPassword = async (userId, newPassword) => {
  const response = await apiClient.post(`/admin/users/${userId}/reset-password`, { newPassword });
  return response.data;
};

export const deleteUser = async (userId) => {
  const response = await apiClient.delete(`/admin/users/${userId}`);
  return response.data;
};

export const createUser = async ({ name, email, password, role, plan }) => {
  const response = await apiClient.post("/admin/users", { name, email, password, role, plan });
  return response.data;
};

export const resetUserTwoFactor = async (userId) => {
  const response = await apiClient.post(`/admin/users/${userId}/reset-2fa`);
  return response.data;
};

// Reports
export const getReports = async (period = "30d") => {
  const response = await apiClient.get("/admin/reports", { params: { period } });
  return response.data;
};

// Coupons
export const getCoupons = async () => {
  const response = await apiClient.get("/admin/coupons");
  return response.data;
};

export const createCoupon = async (data) => {
  const response = await apiClient.post("/admin/coupons", data);
  return response.data;
};

export const updateCoupon = async (couponId, data) => {
  const response = await apiClient.put(`/admin/coupons/${couponId}`, data);
  return response.data;
};

export const deleteCoupon = async (couponId) => {
  const response = await apiClient.delete(`/admin/coupons/${couponId}`);
  return response.data;
};

// Audit logs
export const getAuditLogs = async (params = {}) => {
  const response = await apiClient.get("/admin/audit-logs", { params });
  return response.data;
};

// System settings
export const getSystemSettings = async () => {
  const response = await apiClient.get("/admin/settings");
  return response.data;
};

export const updateSystemSettings = async (data) => {
  const response = await apiClient.put("/admin/settings", data);
  return response.data;
};

// MCP tokens
export const getMcpTokens = async () => {
  const response = await apiClient.get("/admin/mcp-tokens");
  return response.data;
};

export const createMcpTokenForUser = async (userId, label) => {
  const response = await apiClient.post(`/admin/users/${userId}/mcp-tokens`, { label });
  return response.data;
};

export const setMcpTokenLimit = async (userId, limit) => {
  const response = await apiClient.put(`/admin/users/${userId}/mcp-token-limit`, { limit });
  return response.data;
};

export const revokeMcpToken = async (userId, tokenId) => {
  const response = await apiClient.post(`/admin/users/${userId}/mcp-tokens/${tokenId}/revoke`);
  return response.data;
};

// ─── Scope / Whitelist Management ──────────────────────────────────
export const getScopeConfig = async () => {
  const response = await apiClient.get("/admin/scope");
  return response.data;
};

export const updateScopeConfig = async (data) => {
  const response = await apiClient.put("/admin/scope", data);
  return response.data;
};

// ─── API Keys / Provider Settings ──────────────────────────────────
export const getApiKeys = async () => {
  const response = await apiClient.get("/admin/api-keys");
  return response.data;
};

export const updateApiKeys = async (data) => {
  const response = await apiClient.put("/admin/api-keys", data);
  return response.data;
};

export const clearApiKey = async (key) => {
  const response = await apiClient.post("/admin/api-keys/clear", { key });
  return response.data;
};

// ─── Infra monitor ─────────────────────────────────────────────────


// Telegram bot
export const getTelegramBotStatus = async () => {
  const response = await apiClient.get("/admin/infra/telegram");
  return response.data;
};

export const testTelegramConnection = async (token) => {
  const response = await apiClient.post("/admin/infra/telegram/test", { token });
  return response.data;
};

export const setTelegramWebhook = async (url) => {
  const response = await apiClient.post("/admin/infra/telegram/webhook", { url });
  return response.data;
};

export const broadcastTelegramMessage = async (message) => {
  const response = await apiClient.post("/admin/infra/telegram/broadcast", { message });
  return response.data;
};

export const getTelegramUsers = async () => {
  const response = await apiClient.get("/admin/infra/telegram/users");
  return response.data;
};

// Bot token control
export const saveTelegramBotToken = async (token) => {
  const response = await apiClient.post("/admin/infra/telegram/token", { token });
  return response.data;
};

export const startTelegramBot = async () => {
  const response = await apiClient.post("/admin/infra/telegram/start");
  return response.data;
};

export const stopTelegramBot = async () => {
  const response = await apiClient.post("/admin/infra/telegram/stop");
  return response.data;
};

export const getTelegramCommands = async () => {
  const response = await apiClient.get("/admin/infra/telegram/commands");
  return response.data;
};

// Execution logs
export const getExecutionLogs = async (params = {}) => {
  const response = await apiClient.get("/admin/infra/executions", { params });
  return response.data;
};

// Execution quotas / rate limits per plan
export const getExecutionQuotas = async () => {
  const response = await apiClient.get("/admin/infra/quotas");
  return response.data;
};

export const updateExecutionQuota = async (planId, data) => {
  const response = await apiClient.put(`/admin/infra/quotas/${planId}`, data);
  return response.data;
};

// Pentest analytics
export const getPentestAnalytics = async (params = {}) => {
  const response = await apiClient.get("/admin/infra/analytics", { params });
  return response.data;
};

// Active tasks / sessions
export const getActiveTasks = async () => {
  const response = await apiClient.get("/admin/infra/tasks");
  return response.data;
};


export const abortAgentSession = async (sessionId) => {
  const response = await apiClient.post(`/admin/infra/sessions/${sessionId}/abort`);
  return response.data;
};

export const cancelQueuedTask = async (taskId) => {
  const response = await apiClient.post(`/admin/infra/queue/${taskId}/cancel`);
  return response.data;
};

// System resources
export const getSystemResource = async () => {
  const response = await apiClient.get("/admin/infra/system");
  return response.data;
};

// System health snapshot
export const getSystemHealth = async () => {
  const response = await apiClient.get("/admin/infra/health");
  return response.data;
};

// Notification delivery logs
export const getNotificationLogs = async (params = {}) => {
  const response = await apiClient.get("/admin/infra/notifications", { params });
  return response.data;
};



