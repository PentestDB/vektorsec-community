import { apiClient } from "@/utils/axios.config";

export const createWorkspace = async ({ name, description, type }) => {
  const res = await apiClient.post("/workspace/create", { name, description, type });
  return res.data;
};

export const getUserWorkspaces = async () => {
  const res = await apiClient.post("/workspace/list");
  return res.data;
};

export const getWorkspaceDetail = async (workspaceId) => {
  const res = await apiClient.get(`/workspace/${workspaceId}`);
  return res.data;
};

export const getWorkspaceWorkHost = async (workspaceId) => {
  const res = await apiClient.get(`/workspace/${workspaceId}/work-host`);
  return res.data;
};

export const testWorkspaceWorkHost = async ({ workspaceId, workHost }) => {
  const res = await apiClient.post(`/workspace/${workspaceId}/work-host/test`, workHost);
  return res.data;
};

export const listWorkspaceDirectories = async ({ workspaceId, workHost, path }) => {
  const res = await apiClient.post(`/workspace/${workspaceId}/work-host/directories`, {
    workHost,
    path,
  });
  return res.data;
};

export const updateWorkspaceWorkHost = async ({ workspaceId, workHost }) => {
  const res = await apiClient.put(`/workspace/${workspaceId}/work-host`, workHost);
  return res.data;
};

export const deleteWorkspace = async ({ workspaceId }) => {
  const res = await apiClient.post("/workspace/delete", { workspaceId });
  return res.data;
};

export const createSessionInWorkspace = async ({ workspaceId, name, description }) => {
  const res = await apiClient.post(`/workspace/${workspaceId}/create-session`, { name, description });
  return res.data;
};
