import { apiClient } from "@/utils/axios.config";

export const initiateCopilotPentest = async (body) => {
  const token = body.cancelToken;

  const res = await apiClient.post(`/session/init-pentest`, body, {
    cancelToken: token,
  });

  return res.data;
};

export const generateCopilotCommand = async (body) => {
  const token = body.cancelToken;
  const res = await apiClient.post(`/session/generate-command`, body, {
    cancelToken: token,
  });
  return res.data;
};

export const finalizeCopilotCommand = async (body) => {
  const token = body.cancelToken;
  const res = await apiClient.post(`/session/finalize-command`, body, {
    cancelToken: token,
  });
  return res.data;
};

export const storeCommandOutput = async (body) => {
  const token = body.cancelToken;
  const res = await apiClient.post(`/session/store-command-output`, body, {
    cancelToken: token,
  });
  return res.data;
};
export const finalizeOutputAndGetSummary = async (body) => {
  const token = body.cancelToken;
  const res = await apiClient.post(`/session/generate-summary`, body, {
    cancelToken: token,
  });
  return res.data;
};

export const finalizeSummary = async (body) => {
  const token = body.cancelToken;
  const res = await apiClient.post(`/session/finalize-summary`, body, {
    cancelToken: token,
  });
  return res.data;
};

export const finalizeTodoAndResetHistory = async (body) => {
  const token = body.cancelToken;
  const res = await apiClient.post(`/session/reset-loop-history`, body, {
    cancelToken: token,
  });
  return res.data;
};

export const analyzeAllSubprocess = async (body) => {
  const token = body.cancelToken;
  const res = await apiClient.post(`/session/analyze-all-subprocess`, body, {
    cancelToken: token,
  });
  return res.data;
};

export const undoPreviousStep = async (body) => {
  const token = body.cancelToken;
  const res = await apiClient.post(`/session/undo-previous-step`, body, {
    cancelToken: token,
  });
  return res.data;
};

export const actionOnResponse = async ({
  sessionId,
  stepId,
  action,
  feedback,
}) => {
  const res = await apiClient.post(`/session/response-actions`, {
    sessionId,
    stepId,
    action,
    feedback,
  });
  return res.data;
};

export const uploadAnalysisFile = async (body) => {
  const res = await apiClient.post(`/session/upload-analysis-file`, body, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return res.data;
};

export const followGoogleTarget = async (body) => {
  const res = await apiClient.post(`/session/follow-target`, body);
  return res.data;
};
