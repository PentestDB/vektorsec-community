import { apiClient } from "@/utils/axios.config";

/** Lightweight health check (no auth). Use for status bars or monitoring. */
export const getMythicHealth = async () => {
  const res = await apiClient.get("/mythic/health");
  return res.data;
};

export const getMythicConnectionStatus = async () => {
  const res = await apiClient.get("/mythic/connection-status");
  return res.data;
};

export const getMythicCallbacks = async ({ includeInactive = false, limit } = {}) => {
  const params = {};
  if (includeInactive) params.includeInactive = true;
  if (limit != null) params.limit = limit;
  const res = await apiClient.get("/mythic/callbacks", { params });
  return res.data;
};

export const getMythicCallback = async (displayId) => {
  const res = await apiClient.get(`/mythic/callbacks/${displayId}`);
  return res.data;
};

export const getMythicCallbackTasks = async (displayId, { limit } = {}) => {
  const res = await apiClient.get(`/mythic/callbacks/${displayId}/tasks`, {
    params: limit != null ? { limit } : undefined,
  });
  return res.data;
};

export const getMythicTasks = async ({ limit } = {}) => {
  const res = await apiClient.get("/mythic/tasks", {
    params: limit != null ? { limit } : undefined,
  });
  return res.data;
};

export const createMythicTask = async ({ callbackDisplayId, command, params }) => {
  const res = await apiClient.post("/mythic/task", { callbackDisplayId, command, params });
  return res.data;
};

export const getMythicTask = async (displayId) => {
  const res = await apiClient.get(`/mythic/task/${displayId}`);
  return res.data;
};

export const getMythicPorts = async ({ callbackDisplayId } = {}) => {
  const res = await apiClient.get("/mythic/ports", {
    params: callbackDisplayId != null ? { callbackDisplayId } : undefined,
  });
  return res.data;
};

export const getMythicPayloads = async () => {
  const res = await apiClient.get("/mythic/payloads");
  return res.data;
};

export const getMythicC2Profiles = async () => {
  const res = await apiClient.get("/mythic/c2-profiles");
  return res.data;
};

export const getMythicCredentials = async () => {
  const res = await apiClient.get("/mythic/credentials");
  return res.data;
};

export const getMythicFiles = async ({ callbackDisplayId } = {}) => {
  const res = await apiClient.get("/mythic/files", {
    params: callbackDisplayId != null ? { callbackDisplayId } : undefined,
  });
  return res.data;
};

// ─── Settings ──────────────────────────────────────────────────────────

export const getMythicConfig = async () => {
  const res = await apiClient.get("/user/get-mythic-config");
  return res.data;
};

export const updateMythicConfig = async ({ url, token, insecureTls }) => {
  const res = await apiClient.post("/user/update-mythic-config", { url, token, insecureTls });
  return res.data;
};
