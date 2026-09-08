import axios from "axios";

// Same-origin API gateway. The browser only ever talks to the frontend host
// (:3001); server.js reverse-proxies /api/* to the real backend so the
// backend URL is never exposed to (or inlined for) the client.
export const apiBaseURL = "/api";

export const apiClient = axios.create({
  baseURL: apiBaseURL,

  withCredentials: true,
  headers: {
    "Content-type": "application/json",
  },
});
