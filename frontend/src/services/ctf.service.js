import { apiClient, apiBaseURL } from "@/utils/axios.config";

export const connectCtf = async (workspaceId, body) => {
  const res = await apiClient.post(`/ctf/${workspaceId}/connect`, body);
  return res.data;
};

export const getCtfConfig = async (workspaceId) => {
  const res = await apiClient.get(`/ctf/${workspaceId}/config`);
  return res.data;
};

export const syncCtfStream = (workspaceId, onEvent, onDone, onError) => {
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch(`${apiBaseURL}/ctf/${workspaceId}/sync`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || `Sync failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            onEvent(event);
          } catch {
            // skip malformed lines
          }
        }
      }

      onDone?.();
    } catch (err) {
      if (err.name !== "AbortError") {
        onError?.(err);
      }
    }
  })();

  return () => controller.abort();
};

export const getCtfChallenges = async (workspaceId) => {
  const res = await apiClient.get(`/ctf/${workspaceId}/challenges`);
  return res.data;
};

export const submitFlagToCtfd = async (workspaceId, { challengeName, challengeId, flag }) => {
  const res = await apiClient.post(`/ctf/${workspaceId}/submit-flag`, {
    challengeName,
    challengeId,
    flag,
  });
  return res.data;
};

export const reauthCtf = async (workspaceId, body) => {
  const res = await apiClient.patch(`/ctf/${workspaceId}/reauth`, body);
  return res.data;
};

export const setFlagFormat = async (workspaceId, flagFormat) => {
  const res = await apiClient.patch(`/ctf/${workspaceId}/flag-format`, { flagFormat });
  return res.data;
};

export const disconnectCtf = async (workspaceId) => {
  const res = await apiClient.post(`/ctf/${workspaceId}/disconnect`);
  return res.data;
};

export const startSolvingAll = async (workspaceId) => {
  const res = await apiClient.post(`/ctf/${workspaceId}/solve-all`);
  return res.data;
};
