import { apiClient } from "@/utils/axios.config";

// ─── Public ──────────────────────────────────────────────────────────

/** Fetch enabled menu items for the navigation (optionally by placement). */
export const getMenuItems = async (placement = "navbar") => {
  const response = await apiClient.get(`/menus?placement=${placement}`);
  return response.data;
};

// ─── Admin (full CRUD) ───────────────────────────────────────────────

export const listMenuItems = async () => {
  const response = await apiClient.get("/menus/admin");
  return response.data;
};

export const createMenuItem = async (data) => {
  const response = await apiClient.post("/menus/admin", data);
  return response.data;
};

export const updateMenuItem = async (id, data) => {
  const response = await apiClient.put(`/menus/admin/${id}`, data);
  return response.data;
};

export const deleteMenuItem = async (id) => {
  const response = await apiClient.delete(`/menus/admin/${id}`);
  return response.data;
};
