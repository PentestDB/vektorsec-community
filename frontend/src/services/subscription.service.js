import { apiClient } from "@/utils/axios.config";

// Auth: get the current user's subscriptions across all channels.
export const getMySubscriptions = async () => {
  const res = await apiClient.get("/subscriptions/me");
  return res.data;
};

// Auth: get the current user's subscription on a specific channel.
export const getMyChannelSubscription = async (channel) => {
  const res = await apiClient.get(`/subscriptions/me/${channel}`);
  return res.data;
};

// Auth: check whether the user has active access on a channel.
export const checkAccess = async (channel) => {
  const res = await apiClient.get(`/subscriptions/me/${channel}/access`);
  return res.data;
};

// Auth: get today's usage for the user on a channel.
export const getMyUsage = async (channel) => {
  const res = await apiClient.get(`/subscriptions/me/${channel}/usage`);
  return res.data;
};

// Auth: cancel a subscription (keeps access until endsAt).
export const cancelSubscription = async (channel) => {
  const res = await apiClient.post(`/subscriptions/me/${channel}/cancel`);
  return res.data;
};

// Admin: list all subscriptions.
export const getAllSubscriptions = async () => {
  const res = await apiClient.get("/subscriptions/admin");
  return res.data;
};

// Admin: manually trigger expiry of due subscriptions.
export const expireDueSubscriptions = async () => {
  const res = await apiClient.post("/subscriptions/admin/expire-due");
  return res.data;
};
