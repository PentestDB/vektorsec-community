import axios from "axios";

export const apiBaseURL = `${process.env.NEXT_PUBLIC_BACKEND_URI}/api`;

export const apiClient = axios.create({
  baseURL: apiBaseURL,

  withCredentials: true,
  headers: {
    "Content-type": "application/json",
  },
});
