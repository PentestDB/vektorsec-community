import { apiClient, apiBaseURL } from "@/utils/axios.config";

export const connectCtf = async (sessionId, body) => {
  const res = await apiClient.post(`/ctf/${sessionId}/connect`, body);
  return res.data;
};

export const getCtfConfig = async (sessionId) => {
  const res = await apiClient.get(`/ctf/${sessionId}/config`);
  return res.data;
};

export const syncCtfStream = (sessionId, onEvent, onDone, onError) => {
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch(`${apiBaseURL}/ctf/${sessionId}/sync`, {
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

export const getCtfChallenges = async (sessionId) => {
  const res = await apiClient.get(`/ctf/${sessionId}/challenges`);
  return res.data;
};

export const submitFlagToCtfd = async (sessionId, { challengeName, challengeId, flag }) => {
  const res = await apiClient.post(`/ctf/${sessionId}/submit-flag`, {
    challengeName,
    challengeId,
    flag,
  });
  return res.data;
};

export const reauthCtf = async (sessionId, body) => {
  const res = await apiClient.patch(`/ctf/${sessionId}/reauth`, body);
  return res.data;
};

export const disconnectCtf = async (sessionId) => {
  const res = await apiClient.post(`/ctf/${sessionId}/disconnect`);
  return res.data;
};
