import { apiClient } from "@/utils/axios.config";

// ─── Public ──────────────────────────────────────────────────────────

/** Fetch currently-active announcements (for the global popup). */
export const getActiveAnnouncements = async () => {
  const response = await apiClient.get("/announcements/active");
  return response.data;
};

// ─── Admin (full CRUD) ───────────────────────────────────────────────

export const listAnnouncements = async () => {
  const response = await apiClient.get("/announcements/admin");
  return response.data;
};

export const createAnnouncement = async (data) => {
  const response = await apiClient.post("/announcements/admin", data);
  return response.data;
};

export const updateAnnouncement = async (id, data) => {
  const response = await apiClient.put(`/announcements/admin/${id}`, data);
  return response.data;
};

export const deleteAnnouncement = async (id) => {
  const response = await apiClient.delete(`/announcements/admin/${id}`);
  return response.data;
};
