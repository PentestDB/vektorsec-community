import { apiClient } from "@/utils/axios.config";

export const login = async ({ email, password, twoFactorCode, recaptchaToken }) => {
  const response = await apiClient.post("/auth/login", {
    email,
    password,
    twoFactorCode,
    recaptchaToken,
  });

  return response.data;
};

export const register = async ({ name, email, password, recaptchaToken }) => {
  const response = await apiClient.post("/auth/register", {
    name,
    email,
    password,
    recaptchaToken,
  });

  return response.data;
};


export const checkSession = async () => {
  const response = await apiClient.get("/auth/status");

  return response.data;
};

export const logoutUser = async () => {
  const response = await apiClient.post("/auth/logout");

  return response.data;
};

// ─── Two-Factor Authentication (TOTP / Google Authenticator) ──────────

/** Start 2FA setup — returns { secret, otpAuthUri } for the QR code. */
export const setup2FA = async () => {
  const response = await apiClient.post("/auth/2fa/setup");
  return response.data;
};

/** Confirm a 6-digit TOTP code to activate 2FA. */
export const verify2FA = async ({ code }) => {
  const response = await apiClient.post("/auth/2fa/verify", { code });
  return response.data;
};

/** Disable 2FA for the current user. */
export const disable2FA = async () => {
  const response = await apiClient.post("/auth/2fa/disable");
  return response.data;
};
