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

/**
 * Aggregated Pentest cockpit for a workspace: session activity, findings rolled
 * up from every session, discovered targets, attack-chain progress and the
 * effective target scope. Read-only.
 */
export const getWorkspaceOverview = async (workspaceId) => {
  const res = await apiClient.get(`/workspace/${workspaceId}/overview`);
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

export const getWorkspaceAgentConfig = async (workspaceId) => {
  const res = await apiClient.get(`/workspace/${workspaceId}/agent-config`);
  return res.data;
};

export const updateWorkspaceAgentConfig = async ({
  workspaceId,
  maxTurns,
  autonomousMode,
  scope,
}) => {
  const res = await apiClient.put(`/workspace/${workspaceId}/agent-config`, {
    maxTurns,
    autonomousMode,
    scope,
  });
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

/**
 * Engagement report for the whole workspace (every session's findings merged,
 * workspace scope stamped on it).
 *
 * Returned as a full `/api/...` path (not through `apiClient`) so the browser
 * navigates to it directly: the session cookie is sent automatically and the
 * gateway passes the `Content-Disposition: attachment` header through, which
 * makes the browser save the file — same pattern as `sessionReportUrl`.
 */
export const workspaceReportUrl = (workspaceId, format = "markdown") =>
  `/api/workspace/${encodeURIComponent(workspaceId)}/report?format=${encodeURIComponent(format)}`;

/** Same report, served inline (`?inline=1`) so it can be previewed in a tab. */
export const workspaceReportPreviewUrl = (workspaceId, format = "html") =>
  `${workspaceReportUrl(workspaceId, format)}&inline=1`;
