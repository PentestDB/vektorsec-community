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
        const { loadHistory, setAgentState, setPendingConsent, setPendingManualExecution, setTokenUsage } =
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
        if (data.totalTokens != null) {
          setTokenUsage(sessionId, {
            totalTokens: data.totalTokens,
            contextLimit: data.contextLimit ?? 128_000,
            promptTokens: data.promptTokens ?? undefined,
            completionTokens: data.completionTokens ?? undefined,
          });
        }
      })
      .catch(() => {});
  }, [sessionId, store]);

  useEffect(() => {
    const onContextCleared = (e) => {
      if (e.detail?.sessionId !== sessionId) return;
      const st = store.getState();
      const s = st.getSession(sessionId);
      if (s?.controllerRef?.current) {
        try {
          s.controllerRef.current.abort();
        } catch {
          /* ignore */
        }
        s.controllerRef.current = null;
      }
      st.setMessages(sessionId, []);
      st.setAgentState(sessionId, "idle");
      st.setPendingConsent(sessionId, null);
      st.setPendingManualExecution(sessionId, null);
      st.setSubagents(sessionId, []);
      st.setTokenUsage(sessionId, null);
    };
    window.addEventListener("context-cleared", onContextCleared);
    return () => window.removeEventListener("context-cleared", onContextCleared);
  }, [sessionId, store]);

  return null;
}
