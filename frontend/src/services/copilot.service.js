import { apiClient } from "@/utils/axios.config";

export const createNewSession = async (body) => {
  const res = await apiClient.post(`/copilot/create-session`, body);
  return res.data;
};

export const getSessionData = async ({ session_id }) => {
  // post req
  const res = await apiClient.post(`/copilot/get-session`, {
    session_id,
  });

  return res.data;
};

export const getSessionLoopHistory = async ({ session_id }) => {
  // post req
  const res = await apiClient.post(`/copilot/get-session-history`, {
    session_id,
  });

  return res.data;
};

export const createSubprocesses = async ({ commands_list, session_id }) => {
  const res = await apiClient.post(`/copilot/create-subprocess`, {
    commands_list,
    session_id,
  });
  return res.data;
};

export const getUserSessions = async () => {
  const res = await apiClient.post(`/copilot/get-user-sessions`);
  return res.data;
};

export const deleteSession = async ({ session_id }) => {
  const res = await apiClient.post(`/copilot/delete-session`, {
    session_id,
  });
  return res.data;
};

export const getSessionInfo = async (body) => {
  const res = await apiClient.post(`/copilot/get-session-info`, body);
  return res.data;
};

export const getSessionTodoList = async (body) => {
  const res = await apiClient.post(`/copilot/get-session-todo-list`, body);
  return res.data;
};

export const updateSessionTodoList = async (body) => {
  const res = await apiClient.post(`/copilot/update-todo-list`, body);
  return res.data;
};

export const completeSubprocess = async ({ session_id }) => {
  const res = await apiClient.post(`/copilot/complete-subprocess`, {
    session_id,
  });
  return res.data;
};

export const downloadFiles = async ({ session_id }) => {
  const response = await apiClient.post(
    `/copilot/download`,
    {
      session_id,
    },
    {
      responseType: "blob", // Set the response type to 'blob'
    }
  );

  const fileName = `${Date.now()}.zip`; // Generate a unique file name

  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

// Netcat
export const getNetcatSessionData = async ({ netcat_id }) => {
  const res = await apiClient.post(`/copilot/netcat-data`, { netcat_id });
  return res.data;
};

export const initiateNetcatSession = async ({ session_id, access }) => {
  const res = await apiClient.post(`/copilot/initiate-netcat`, {
    session_id,
    access,
  });
  return res.data;
};

export const startNetcat = async (body) => {
  const res = await apiClient.post(`/copilot/start-netcat`, body);
  return res.data;
};

// OpenVPN — legacy (kept for backward compat)
export const uploadOpenVPN = async (data) => {
  const res = await apiClient.post(`/copilot/upload-openvpn`, data, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return res.data;
};

export const checkUserVPN = async (body) => {
  const res = await apiClient.post(`/copilot/check-user-vpn`);
  return res.data;
};

export const connectOpenVPN = async (body) => {
  const res = await apiClient.post(`/copilot/connect-openvpn`, body);
  return res.data;
};

export const disconnectOpenVPN = async (body) => {
  const res = await apiClient.post(`/copilot/disconnect-openvpn`, body);
  return res.data;
};

export const checkVPNStatus = async (body) => {
  const res = await apiClient.post(`/copilot/check-openvpn-status`, body);
  return res.data;
};

// VPN — multi-profile endpoints
export const uploadVPNProfile = async (data) => {
  const res = await apiClient.post(`/copilot/vpn/profiles/upload`, data, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
};

export const listVPNProfiles = async () => {
  const res = await apiClient.get(`/copilot/vpn/profiles`);
  return res.data;
};

export const deleteVPNProfile = async (body) => {
  const res = await apiClient.post(`/copilot/vpn/profiles/delete`, body);
  return res.data;
};

export const connectVPNProfile = async (body) => {
  const res = await apiClient.post(`/copilot/vpn/connect`, body);
  return res.data;
};

export const disconnectVPNConnection = async (body) => {
  const res = await apiClient.post(`/copilot/vpn/disconnect`, body);
  return res.data;
};

export const disconnectAllVPNConnections = async (body) => {
  const res = await apiClient.post(`/copilot/vpn/disconnect-all`, body);
  return res.data;
};

export const getVPNStatus = async (body) => {
  const res = await apiClient.post(`/copilot/vpn/status`, body);
  return res.data;
};

export const connectToVNC = async (body) => {
  const res = await apiClient.post(`/copilot/connect-vnc`, body);
  return res.data;
};
