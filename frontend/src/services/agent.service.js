import { apiClient, apiBaseURL } from "@/utils/axios.config";

export const createSession = async ({ name, description }) => {
  const res = await apiClient.post("/agent/create-session", { name, description });
  return res.data;
};

export const getUserSessions = async () => {
  const res = await apiClient.post("/agent/sessions");
  return res.data;
};

export const getSessionInfo = async (sessionId) => {
  const res = await apiClient.get(`/agent/session/${sessionId}`);
  return res.data;
};

export const getSessionAgentToolsConfig = async (sessionId) => {
  const res = await apiClient.get(`/agent/session/${sessionId}/agent-tools-config`);
  return res.data;
};

export const updateSessionAgentToolsConfig = async (sessionId, body) => {
  const res = await apiClient.post(`/agent/session/${sessionId}/agent-tools-config`, body);
  return res.data;
};

export const getSessionHistory = async (sessionId) => {
  const res = await apiClient.get(`/agent/session/${sessionId}/history`);
  return res.data;
};

export const getVulnerabilities = async (sessionId) => {
  const res = await apiClient.get(`/agent/session/${sessionId}/vulnerabilities`);
  return res.data;
};

export const getVulnerability = async (sessionId, vulnerabilityId) => {
  const res = await apiClient.get(
    `/agent/session/${sessionId}/vulnerabilities/${vulnerabilityId}`,
  );
  return res.data;
};

export const chatAboutVulnerability = async ({ sessionId, vulnerabilityId, message }) => {
  const res = await apiClient.post(
    `/agent/session/${sessionId}/vulnerabilities/${vulnerabilityId}/chat`,
    { message },
  );
  return res.data;
};

export const deleteSession = async ({ sessionId }) => {
  const res = await apiClient.post("/agent/delete-session", { sessionId });
  return res.data;
};

export const pauseAgent = async ({ sessionId }) => {
  const res = await apiClient.post("/agent/pause", { sessionId });
  return res.data;
};

export const clearContext = async ({ sessionId }) => {
  const res = await apiClient.post("/agent/clear-context", { sessionId });
  return res.data;
};

export const respondToConsent = async ({ sessionId, approved }) => {
  const res = await apiClient.post("/agent/consent", { sessionId, approved });
  return res.data;
};

export const submitManualOutput = async ({ sessionId, output }) => {
  const res = await apiClient.post("/agent/manual-output", { sessionId, output });
  return res.data;
};

export const installCapability = async ({ sessionId, capabilityName }) => {
  const res = await apiClient.post("/agent/install-capability", { sessionId, capabilityName });
  return res.data;
};

export const getSlashCommands = async () => {
  const res = await apiClient.get("/agent/slash-commands");
  return res.data;
};

// Shell API
export const getShellList = async (sessionId) => {
  const res = await apiClient.get(`/shell/${sessionId}/list`);
  return res.data;
};

export const getShellBuffer = async (sessionId, shellId, fromOffset) => {
  const params = fromOffset ? { fromOffset } : {};
  const res = await apiClient.get(`/shell/${sessionId}/${shellId}/buffer`, { params });
  return res.data;
};

export const spawnShellApi = async (sessionId, label) => {
  const res = await apiClient.post(`/shell/${sessionId}/spawn`, { label });
  return res.data;
};

export const closeShellApi = async (sessionId, shellId) => {
  const res = await apiClient.delete(`/shell/${sessionId}/${shellId}`);
  return res.data;
};

export const getConnectionStatus = async (sessionId) => {
  const res = await apiClient.get(`/shell/${sessionId}/connection`);
  return res.data;
};

export const reconnectSSH = async (sessionId) => {
  const res = await apiClient.post(`/shell/${sessionId}/reconnect`);
  return res.data;
};

export const getSubagents = async (sessionId) => {
  const res = await apiClient.get(`/shell/${sessionId}/subagents`);
  return res.data;
};

export function connectAgentStream({ sessionId, message, endpoint = "message" }) {
  return new Promise((resolve) => {
    const url = `${apiBaseURL}/agent/${endpoint}`;

    let bodyObj;
    if (endpoint === "consent" || endpoint === "manual-output") {
      try {
        bodyObj = { sessionId, ...JSON.parse(message) };
      } catch {
        bodyObj = { sessionId, message };
      }
    } else {
      bodyObj = { sessionId, message };
    }
    const body = JSON.stringify(bodyObj);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.withCredentials = true;

    let buffer = "";
    let lastProcessedIndex = 0;
    const handlers = {};

    const controller = {
      onEvent(event, handler) {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(handler);
        return controller;
      },
      abort() {
        xhr.abort();
      },
    };

    function emit(event, data) {
      const fns = handlers[event] || [];
      fns.forEach((fn) => fn(data));
      const anyFns = handlers["*"] || [];
      anyFns.forEach((fn) => fn(event, data));
    }

    function processBuffer() {
      const text = xhr.responseText.substring(lastProcessedIndex);
      lastProcessedIndex = xhr.responseText.length;
      buffer += text;

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      let currentEvent = null;
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.substring(7).trim();
        } else if (line.startsWith("data: ") && currentEvent) {
          try {
            const data = JSON.parse(line.substring(6));
            emit(currentEvent, data);
          } catch {
            emit(currentEvent, { raw: line.substring(6) });
          }
          currentEvent = null;
        }
      }
    }

    xhr.onprogress = processBuffer;

    xhr.onloadend = () => {
      processBuffer();
      if (xhr.status >= 400) {
        let errorMsg = `Server error (${xhr.status})`;
        try {
          const parsed = JSON.parse(xhr.responseText);
          if (parsed?.message) errorMsg = parsed.message;
        } catch {
          // not JSON
        }
        emit("error", { message: errorMsg });
      }
      emit("_stream_end", {});
    };

    xhr.onerror = () => {
      emit("error", { message: "Connection failed — check your network" });
      emit("_stream_end", {});
    };

    xhr.send(body);

    resolve(controller);
  });
}
