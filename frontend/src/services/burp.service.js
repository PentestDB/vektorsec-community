import { apiClient } from "@/utils/axios.config";

/** Lightweight health check (no auth). Use for status bars or monitoring. */
export const getBurpHealth = async () => {
  const res = await apiClient.get("/burp/health");
  return res.data;
};

export const getBurpConnectionStatus = async () => {
  const res = await apiClient.get("/burp/connection-status");
  return res.data;
};

export const getBurpCaStatus = async () => {
  const res = await apiClient.get("/burp/ca/status");
  return res.data;
};

export const configureBurpCa = async () => {
  const res = await apiClient.post("/burp/ca/configure");
  return res.data;
};

export const getBurpProxyHistory = async ({
  page = 1,
  pageSize = 20,
  search,
  method,
  statusMin,
  statusMax,
  hideAssets,
} = {}) => {
  const params = { page, pageSize };
  if (search != null) params.search = search;
  if (method != null) params.method = method;
  if (statusMin != null) params.statusMin = statusMin;
  if (statusMax != null) params.statusMax = statusMax;
  if (hideAssets != null) params.hideAssets = hideAssets;
  const res = await apiClient.get("/burp/proxy-history", { params });
  return res.data;
};

export const getBurpProxyEntry = async (id) => {
  const res = await apiClient.get(`/burp/proxy-entry/${id}`);
  return res.data;
};

export const sendBurpRequest = async ({ host, port, secure, rawRequest }) => {
  const res = await apiClient.post("/burp/send-request", {
    host,
    port,
    secure,
    rawRequest,
  });
  return res.data;
};

export const sendToRepeater = async ({ host, port, secure, rawRequest, tabName }) => {
  const res = await apiClient.post("/burp/send-to-repeater", {
    host,
    port,
    secure,
    rawRequest,
    tabName,
  });
  return res.data;
};

export const sendToIntruder = async ({ host, port, secure, rawRequest, tabName, insertionPoints }) => {
  const res = await apiClient.post("/burp/send-to-intruder", {
    host,
    port,
    secure,
    rawRequest,
    tabName,
    insertionPoints,
  });
  return res.data;
};

export const repeaterSend = async ({ host, port, secure, rawRequest }) => {
  const res = await apiClient.post("/burp/repeater-send", {
    host,
    port,
    secure,
    rawRequest,
  });
  return res.data;
};

export const generateCollaboratorPayload = async ({ customData } = {}) => {
  const res = await apiClient.post("/burp/collaborator/generate", { customData });
  return res.data;
};

export const pollCollaborator = async ({ secretKey }) => {
  const res = await apiClient.post("/burp/collaborator/poll", { secretKey });
  return res.data;
};

export const getProxyInterceptStatus = async () => {
  const res = await apiClient.get("/burp/proxy/intercept-status");
  return res.data;
};

export const setProxyIntercept = async ({ enabled }) => {
  const res = await apiClient.post("/burp/proxy/set-intercept", { enabled });
  return res.data;
};
