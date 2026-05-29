import { apiClient } from "@/utils/axios.config";

export const getCaidoHealth = async () => {
  const res = await apiClient.get("/caido/health");
  return res.data;
};

export const getCaidoConnectionStatus = async () => {
  const res = await apiClient.get("/caido/connection-status");
  return res.data;
};

export const getCaidoHttpHistory = async ({
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
  const res = await apiClient.get("/caido/http-history", { params });
  return res.data;
};

export const getCaidoHttpEntry = async (id) => {
  const res = await apiClient.get(`/caido/http-entry/${id}`);
  return res.data;
};

export const sendCaidoRequest = async ({ host, port, secure, rawRequest }) => {
  const res = await apiClient.post("/caido/send-request", {
    host,
    port,
    secure,
    rawRequest,
  });
  return res.data;
};

export const sendToReplay = async ({ host, port, secure, rawRequest, tabName }) => {
  const res = await apiClient.post("/caido/send-to-replay", {
    host,
    port,
    secure,
    rawRequest,
    tabName,
  });
  return res.data;
};

export const sendToAutomate = async ({ host, port, secure, rawRequest, tabName }) => {
  const res = await apiClient.post("/caido/send-to-automate", {
    host,
    port,
    secure,
    rawRequest,
    tabName,
  });
  return res.data;
};

export const replaySend = async ({ host, port, secure, rawRequest }) => {
  const res = await apiClient.post("/caido/replay-send", {
    host,
    port,
    secure,
    rawRequest,
  });
  return res.data;
};

export const getCaidoInterceptStatus = async () => {
  const res = await apiClient.get("/caido/intercept-status");
  return res.data;
};

export const setCaidoIntercept = async ({ enabled }) => {
  const res = await apiClient.post("/caido/proxy/set-intercept", { enabled });
  return res.data;
};
