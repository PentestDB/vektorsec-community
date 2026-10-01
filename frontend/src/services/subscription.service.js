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

// Auth: start the one-off free trial on a channel (201 = new trial,
// 200 = trial already active, 409 = the trial was already used).
export const startTrial = async (channel = "online", planId) => {
  const res = await apiClient.post(`/subscriptions/me/${channel}/trial`, {
    ...(planId ? { planId } : {}),
  });
  return res.data;
};

/**
 * Same-origin download URL for a channel's usage history.
 *
 * Returned as a full `/api/...` path (not through `apiClient`) so the browser
 * navigates to it directly: the session cookie is sent automatically and the
 * gateway relays the `Content-Disposition: attachment` header, which makes the
 * browser save the CSV file.
 */
export const usageExportUrl = (channel = "online", days = 30) =>
  `/api/subscriptions/me/${encodeURIComponent(channel)}/usage/export?days=${encodeURIComponent(days)}`;

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
