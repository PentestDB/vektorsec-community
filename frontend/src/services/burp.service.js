import { apiClient } from "@/utils/axios.config";

export const getBurpProxyHistory = async ({ page = 1, pageSize = 20 } = {}) => {
  const res = await apiClient.get("/burp/proxy-history", {
    params: { page, pageSize },
  });
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
