import { apiClient } from "@/utils/axios.config";

export const updateUserProfile = async (body) => {
  const res = await apiClient.post(`/user/update-user-profile`, body);
  return res.data;
};

export const uploadUserProfileImage = async (body) => {
  const res = await apiClient.post(`/user/update-user-profile-image`, body, {
    headers: {
      "Content-type": "multipart/form-data",
    },
  });
  return res.data;
};

export const toolPreferenceUpdate = async (body) => {
  const res = await apiClient.post(`/user/update-tools-preference`, body);
  return res.data;
};

export const getUserTools = async () => {
  const res = await apiClient.get(`/user/get-user-tools`);
  return res.data;
};

export const getCapabilities = async () => {
  const res = await apiClient.get(`/user/get-capabilities`);
  return res.data;
};

export const updateCapabilities = async (body) => {
  const res = await apiClient.post(`/user/update-capabilities`, body);
  return res.data;
};

export const detectCapabilities = async () => {
  const res = await apiClient.post(`/user/detect-capabilities`);
  return res.data;
};

export const saveUserInformation = async (body) => {
  const res = await apiClient.post("/user/save-user-information", body);
  return res.data;
};

export const getModelConfig = async () => {
  const res = await apiClient.get("/user/get-model-config");
  return res.data;
};

export const updateModelConfig = async (body) => {
  const res = await apiClient.post("/user/update-model-config", body);
  return res.data;
};

export const deleteModelConfig = async (body) => {
  const res = await apiClient.post("/user/delete-model-config", body);
  return res.data;
};

export const getAvailableModels = async () => {
  const res = await apiClient.get("/user/available-models");
  return res.data;
};

export const initiateAnthropicOAuth = async (body) => {
  const res = await apiClient.post("/user/anthropic-oauth/initiate", body);
  return res.data;
};

export const exchangeAnthropicOAuth = async (body) => {
  const res = await apiClient.post("/user/anthropic-oauth/exchange", body);
  return res.data;
};

export const disconnectAnthropicOAuth = async (body) => {
  const res = await apiClient.post("/user/anthropic-oauth/disconnect", body);
  return res.data;
};

export const getSSHConfig = async () => {
  const res = await apiClient.get("/user/get-ssh-config");
  return res.data;
};

export const updateSSHConfig = async (body) => {
  const res = await apiClient.post("/user/update-ssh-config", body);
  return res.data;
};

export const updateSafetyProtections = async (body) => {
  const res = await apiClient.post("/user/update-safety-protections", body);
  return res.data;
};

export const getVNCConfig = async (sessionId) => {
  const res = await apiClient.get("/user/get-vnc-config", {
    params: sessionId ? { sessionId } : undefined,
  });
  return res.data;
};

export const updateVNCConfig = async (body) => {
  const res = await apiClient.post("/user/update-vnc-config", body);
  return res.data;
};

export const resetVNCConfig = async (body) => {
  const res = await apiClient.post("/user/reset-vnc-config", body);
  return res.data;
};

export const autoSetupVNC = async (body = {}) => {
  const res = await apiClient.post("/user/auto-setup-vnc", body);
  return res.data;
};

export const diagnoseVNC = async (body = {}) => {
  const res = await apiClient.post("/user/diagnose-vnc", body);
  return res.data;
};

export const repairVNC = async (body) => {
  const res = await apiClient.post("/user/repair-vnc", body);
  return res.data;
};

export const getBurpConfig = async () => {
  const res = await apiClient.get("/user/get-burp-config");
  return res.data;
};

export const updateBurpConfig = async (body) => {
  const res = await apiClient.post("/user/update-burp-config", body);
  return res.data;
};

export const getCaidoConfig = async () => {
  const res = await apiClient.get("/user/get-caido-config");
  return res.data;
};

export const updateCaidoConfig = async (body) => {
  const res = await apiClient.post("/user/update-caido-config", body);
  return res.data;
};

export const getMagnitudeConfig = async () => {
  const res = await apiClient.get("/user/get-magnitude-config");
  return res.data;
};

export const updateMagnitudeConfig = async (body) => {
  const res = await apiClient.post("/user/update-magnitude-config", body);
  return res.data;
};

export const startMagnitudeAgent = async (body) => {
  const res = await apiClient.post("/user/start-magnitude-agent", body);
  return res.data;
};

export const getBrowserAgentVNC = async () => {
  const res = await apiClient.get("/user/get-browser-agent-vnc");
  return res.data;
};

export const getAgentToolsConfig = async () => {
  const res = await apiClient.get("/user/get-agent-tools-config");
  return res.data;
};

export const updateAgentToolsConfig = async (body) => {
  const res = await apiClient.post("/user/update-agent-tools-config", body);
  return res.data;
};

export const getAgentBehaviorConfig = async () => {
  const res = await apiClient.get("/user/agent-behavior");
  return res.data;
};

export const updateAgentBehaviorConfig = async (body) => {
  const res = await apiClient.post("/user/agent-behavior", body);
  return res.data;
};

export const getSwarmModels = async () => {
  const res = await apiClient.get("/user/get-swarm-models");
  return res.data;
};

export const updateSwarmModels = async (body) => {
  const res = await apiClient.post("/user/update-swarm-models", body);
  return res.data;
};

export const getModels = getSwarmModels;
export const updateModels = updateSwarmModels;

export const getSubscriptionProviders = async () => {
  const res = await apiClient.get("/user/subscription-providers");
  return res.data;
};

export const connectSubscriptionProvider = async (body) => {
  const res = await apiClient.post(
    "/user/subscription-providers/connect",
    body,
  );
  return res.data;
};

export const testSubscriptionProvider = async (body) => {
  const res = await apiClient.post("/user/subscription-providers/test", body);
  return res.data;
};

export const getMcpConfig = async () => {
  const res = await apiClient.get("/mcp/config");
  return res.data;
};

export const createMcpAccessToken = async (body) => {
  const res = await apiClient.post("/mcp/tokens", body || {});
  return res.data;
};

export const updateMcpSafety = async (body) => {
  const res = await apiClient.post("/mcp/safety", body || {});
  return res.data;
};

export const revokeMcpAccessToken = async (tokenId) => {
  const res = await apiClient.delete(`/mcp/tokens/${tokenId}`);
  return res.data;
};
