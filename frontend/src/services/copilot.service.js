import { apiClient } from "@/utils/axios.config";

export const createNewSession = async (body) => {
  const res = await apiClient.post(`/copilot/create_session`, body);
  return res.data;
};

export const getSessionData = async ({ session_id }) => {
  // post req
  const res = await apiClient.post(`/copilot/get_session`, {
    session_id,
  });

  return res.data;
};

export const getSessionLoopHistory = async ({ session_id }) => {
  // post req
  const res = await apiClient.post(`/copilot/get_session_history`, {
    session_id,
  });

  return res.data;
};

export const createSubprocesses = async ({ commands_list, session_id }) => {
  const res = await apiClient.post(`/copilot/create_subprocess`, {
    commands_list,
    session_id,
  });
  return res.data;
};

export const getUserSessions = async () => {
  const res = await apiClient.post(`/copilot/get_user_sessions`);
  return res.data;
};

export const deleteSession = async ({ session_id }) => {
  const res = await apiClient.post(`/copilot/delete_session`, {
    session_id,
  });
  return res.data;
};

export const getSessionInfo = async (body) => {
  const res = await apiClient.post(`/copilot/get_session_info`, body);
  return res.data;
};

export const getSessionTodoList = async (body) => {
  const res = await apiClient.post(`/copilot/get_session_todo_list`, body);
  return res.data;
};

export const updateSessionTodoList = async (body) => {
  const res = await apiClient.post(`/copilot/update-todo-list`, body);
  return res.data;
};

export const completeSubprocess = async ({ session_id }) => {
  const res = await apiClient.post(`/copilot/complete_subprocess`, {
    session_id,
  });
  return res.data;
};

export const getUserInfo = async () => {
  const res = await apiClient.get(`/copilot/get_user_details`);
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

export const uploadUserProfileImage = async (data) => {
  const res = await apiClient.post(`/copilot/upload-user-profile-image`, data, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return res.data;
};

// OpenVPN
export const uploadOpenVPN = async (data) => {
  const res = await apiClient.post(`/copilot/upload_openvpn`, data, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return res.data;
};

export const checkUserVPN = async (body) => {
  const res = await apiClient.post(`/copilot/check_user_vpn`);
  return res.data;
};

export const connectOpenVPN = async (body) => {
  const res = await apiClient.post(`/copilot/connect_openvpn`, body);
  return res.data;
};

export const disconnectOpenVPN = async (body) => {
  const res = await apiClient.post(`/copilot/disconnect_openvpn`, body);
  return res.data;
};

export const checkVPNStatus = async (body) => {
  const res = await apiClient.post(`/copilot/check_openvpn_status`, body);
  return res.data;
};

export const connectToVNC = async (body) => {
  const res = await apiClient.post(`/copilot/connect_vnc`, body);
  return res.data;
};
