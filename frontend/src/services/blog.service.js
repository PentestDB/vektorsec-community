import { apiClient } from "@/utils/axios.config";

// ─── Public ──────────────────────────────────────────────────────────

/** List published articles. */
export const getPublishedArticles = async () => {
  const response = await apiClient.get("/blog");
  return response.data;
};

/** Get a single published article by slug. */
export const getArticleBySlug = async (slug) => {
  const response = await apiClient.get(`/blog/${slug}`);
  return response.data;
};

// ─── Admin (full CRUD) ───────────────────────────────────────────────

export const listArticles = async () => {
  const response = await apiClient.get("/blog/admin/list");
  return response.data;
};

export const createArticle = async (data) => {
  const response = await apiClient.post("/blog/admin", data);
  return response.data;
};

export const updateArticle = async (id, data) => {
  const response = await apiClient.put(`/blog/admin/${id}`, data);
  return response.data;
};

export const deleteArticle = async (id) => {
  const response = await apiClient.delete(`/blog/admin/${id}`);
  return response.data;
};
