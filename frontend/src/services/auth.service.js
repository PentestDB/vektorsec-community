import { apiClient } from "@/utils/axios.config";

export const login = async ({ email, password }) => {
  const response = await apiClient.post("/auth/login", {
    email,
    password,
  });

  return response.data;
};

export const register = async ({ name, email, password }) => {
  const response = await apiClient.post("/auth/register", {
    name,
    email,
    password,
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