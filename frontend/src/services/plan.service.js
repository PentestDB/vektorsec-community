import { apiClient } from "@/utils/axios.config";

// Public: list enabled plans for the pricing page / checkout.
export const getEnabledPlans = async () => {
  const res = await apiClient.get("/plans");
  return res.data;
};

// Admin: list all plans (including disabled).
export const getAllPlans = async () => {
  const res = await apiClient.get("/plans/admin");
  return res.data;
};

// Admin: create a new plan.
export const createPlan = async (body) => {
  const res = await apiClient.post("/plans/admin", body);
  return res.data;
};

// Admin: update an existing plan.
export const updatePlan = async (planId, body) => {
  const res = await apiClient.put(`/plans/admin/${planId}`, body);
  return res.data;
};

// Admin: delete a plan.
export const deletePlan = async (planId) => {
  const res = await apiClient.delete(`/plans/admin/${planId}`);
  return res.data;
};
