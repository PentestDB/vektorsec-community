import { apiClient } from "@/utils/axios.config";

export const getPlans = async () => {
  const res = await apiClient.get("/billing/plans");
  return res.data;
};

export const getMyBilling = async () => {
  const res = await apiClient.get("/billing/me");
  return res.data;
};

export const getUsage = async () => {
  const res = await apiClient.get("/billing/usage");
  return res.data;
};

export const upgradePlan = async (body) => {
  const res = await apiClient.post("/billing/upgrade", body);
  return res.data;
};

export const cancelPlan = async () => {
  const res = await apiClient.post("/billing/cancel");
  return res.data;
};

export const resumePlan = async () => {
  const res = await apiClient.post("/billing/resume");
  return res.data;
};

export const redeemCoupon = async (coupon) => {
  const res = await apiClient.post("/billing/redeem-coupon", { coupon });
  return res.data;
};
