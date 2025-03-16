import { apiClient } from "@/utils/axios.config";

export const initiatePentestExploitBox = async (body) => {
  const res = await apiClient.post(`/task/spin-up`, body);
  return res.data;
};

export const checkExploitBoxStatus = async ({ session_id }) => {
  const res = await apiClient.get(`/task/check-exploit-box/${session_id}`);
  return res.data;
};

export const extendContainerTime = async (body) => {
  const res = await apiClient.post(`/task/extend-container-expiration`, body);
  return res.data;
};

export const stopTask = async (body) => {
  const res = await apiClient.post(`/task/stop-task`, body);
  return res.data;
};

export const createEBSvolume = async () => {
  const res = await apiClient.post(`/task/create-personal-volume`);
  return res.data;
};

export const getVolumeStatus = async () => {
  const res = await apiClient.get(`/task/get-volume-status`);
  return res.data;
};

export const formatVolume = async () => {
  const res = await apiClient.get(`/task/format-personal-volume`);
  return res.data;
};
