import { apiClient } from "@/utils/axios.config";

export const updateUserProfile = async (body) => {
  const res = await apiClient.post(`/user/update-user-profile`, body);
  return res.data;
};

export const uploadUserProfileImage = async (body) => {
  const res = await apiClient.post(`/user/update-user-profile-image`, body, {
    headers: {
      "Content-type": "multipart/form-data",
    },
  });
  return res.data;
};

export const sendBugbaseLinkRequest = async (body) => {
  const res = await apiClient.post(`/user/link-bugbase-request`, body);
  return res.data;
};

export const getUserKycDetails = async () => {
  const res = await apiClient.get(`/user/get-user-kyc`);
  return res.data;
};

export const syncBugbaseKYCDetails = async (body) => {
  const res = await apiClient.post(`/user/sync-bugbase-kyc`, body);
  return res.data;
};

export const submitUserKYCData = async (body) => {
  const res = await apiClient.post(`/user/update-kyc`, body);
  return res.data;
};

export const generateAadhaarOtp = async (body) => {
  const res = await apiClient.post(`/user/generate-aadhaar-otp`, body);
  return res.data;
};

export const verifyAadhaarOtp = async (body) => {
  const res = await apiClient.post(`/user/verify-aadhaar-otp`, body);
  return res.data;
};

export const verifyPANNumber = async (body) => {
  const res = await apiClient.post(`/user/verify-pan`, body);
  return res.data;
};

export const verifyPassport = async (body) => {
  const res = await apiClient.post(`/user/verify-passport`, body, {
    headers: {
      "Content-type": "multipart/form-data",
    },
  });
  return res.data;
};

export const submitFinalKYC = async (body) => {
  const res = await apiClient.post(`/user/verify-final-kyc`, body);
  return res.data;
};

export const toolPreferenceUpdate = async (body) => {
  const res = await apiClient.post(`/user/update-tools-preference`, body);
  return res.data;
};

export const getUserTools = async () => {
  const res = await apiClient.get(`/user/get-user-tools`);
  return res.data;
};

export const getBillingData = async (body) => {
  const res = await apiClient.post("/user/get-billing-details", body);
  return res.data;
};

export const saveUserInformation = async (body) => {
  const res = await apiClient.post("/user/save-user-information", body);
  return res.data;
};

export const checkUserAccess = async (body) => {
  const res = await apiClient.post("/user/check-access", body);
  return res.data;
};
