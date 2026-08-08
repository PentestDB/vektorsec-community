import { apiClient } from "@/utils/axios.config";

// Public: enabled payment channels for the checkout page.
export const getEnabledGateways = async () => {
  const res = await apiClient.get("/payment/gateways");
  return res.data;
};

// Authenticated: create a payment order.
export const createPaymentOrder = async (body) => {
  const res = await apiClient.post("/payment/order", body);
  return res.data;
};

// Authenticated: list my orders.
export const getMyOrders = async () => {
  const res = await apiClient.get("/payment/orders");
  return res.data;
};

// Authenticated: get a single order.
export const getOrder = async (orderId) => {
  const res = await apiClient.get(`/payment/orders/${orderId}`);
  return res.data;
};

// Authenticated: cancel a pending order.
export const cancelOrder = async (orderId) => {
  const res = await apiClient.post(`/payment/orders/${orderId}/cancel`);
  return res.data;
};

// Admin: list all gateways.
export const getAllGateways = async () => {
  const res = await apiClient.get("/payment/admin/gateways");
  return res.data;
};

// Admin: save/update a gateway.
export const saveGateway = async (body) => {
  const res = await apiClient.post("/payment/admin/gateways", body);
  return res.data;
};

// Admin: list all orders.
export const getAllOrders = async (status) => {
  const res = await apiClient.get("/payment/admin/orders", {
    params: status ? { status } : {},
  });
  return res.data;
};

// Admin: mark an order as paid.
export const markOrderPaid = async (orderId, body) => {
  const res = await apiClient.post(`/payment/admin/orders/${orderId}/paid`, body);
  return res.data;
};

// Admin: confirm an order and activate the plan.
export const confirmOrder = async (orderId, body) => {
  const res = await apiClient.post(`/payment/admin/orders/${orderId}/confirm`, body);
  return res.data;
};

// ─── Token top-up ───────────────────────────────────────────────
// Public: enabled top-up packages.
export const getTopUpPackages = async () => {
  const res = await apiClient.get("/payment/topup/packages");
  return res.data;
};

// Authenticated: current user token balance.
export const getMyCredits = async () => {
  const res = await apiClient.get("/payment/credits");
  return res.data;
};

// Authenticated: create a top-up order.
export const createTopUpOrder = async (body) => {
  const res = await apiClient.post("/payment/topup/order", body);
  return res.data;
};

// Admin: all top-up packages.
export const getTopUpPackagesAdmin = async () => {
  const res = await apiClient.get("/payment/admin/topup/packages");
  return res.data;
};

// Admin: save/create a top-up package.
export const saveTopUpPackage = async (body) => {
  const res = await apiClient.post("/payment/admin/topup/packages", body);
  return res.data;
};

// Admin: delete a top-up package.
export const deleteTopUpPackage = async (packageId) => {
  const res = await apiClient.delete(`/payment/admin/topup/packages/${packageId}`);
  return res.data;
};

// Admin: manually credit tokens to a user.
export const creditTokens = async (userId, tokens) => {
  const res = await apiClient.post("/payment/admin/topup/credit", { userId, tokens });
  return res.data;
};
