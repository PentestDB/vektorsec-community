"use client";

import { useEffect, useRef } from "react";
import { useAgentStreamStore } from "@/store/agentStream.store";
import { getSessionHistory } from "@/services/agent.service";

export default function AgentStreamConnector({ sessionId }) {
  const store = useAgentStreamStore;
  const initRef = useRef(null);

  useEffect(() => {
    if (!sessionId) return;
    if (initRef.current === sessionId) return;
    initRef.current = sessionId;

    store.getState().getOrCreate(sessionId);

    const sess = store.getState().getSession(sessionId);
    if (sess && sess.historyLoaded) return;

    getSessionHistory(sessionId)
      .then((data) => {
        if (!data) return;
        const { loadHistory, setAgentState, setPendingConsent, setPendingManualExecution } =
          store.getState();
        if (data.messages) {
          loadHistory(sessionId, data.messages, data.subagents);
        }
        if (data.agentState) {
          setAgentState(sessionId, data.agentState);
        }
        if (data.pendingConsent) {
          setPendingConsent(sessionId, data.pendingConsent);
        }
        if (data.pendingManualExecution) {
          setPendingManualExecution(sessionId, data.pendingManualExecution);
        }
      })
      .catch(() => {});
  }, [sessionId, store]);

  return null;
}
