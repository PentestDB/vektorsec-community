"use client";

import { useEffect, useRef } from "react";
import { useAgentStreamStore } from "@/store/agentStream.store";
import { getSessionHistory } from "@/services/agent.service";

function convertDbMessagesToStreamFormat(dbMessages) {
  const entries = [];
  for (const m of dbMessages) {
    if (m.role === "assistant") {
      if (m.reasoning) {
        entries.push({ type: "thinking", content: m.reasoning });
      }
      if (m.content) {
        entries.push({ type: "assistant", content: m.content });
      }
      if (m.toolCalls?.length) {
        for (const tc of m.toolCalls) {
          entries.push({
            type: "tool",
            name: tc.name,
            args: tc.arguments,
            status: "done",
            output: "",
            toolCallId: tc.id,
          });
        }
      }
    } else if (m.role === "tool") {
      const existing = entries.findLast(
        (e) => e.type === "tool" && e.toolCallId === m.toolCallId,
      );
      if (existing) {
        existing.output = m.content || "";
        existing.status = "done";
      } else {
        entries.push({
          type: "tool",
          name: m.toolName || "unknown",
          args: "{}",
          status: "done",
          output: m.content || "",
          toolCallId: m.toolCallId,
        });
      }
    }
  }
  return entries;
}

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
          const restoredSwarms = (data.swarms || []).map((sw) => ({
            ...sw,
            agents: (sw.agents || []).map((a) => ({
              ...a,
              thinkingContent: "",
              toolCalls: [],
              messages: convertDbMessagesToStreamFormat(a.messages || []),
            })),
          }));
          loadHistory(sessionId, data.messages, data.subagents, restoredSwarms);
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
      st.setSwarms(sessionId, []);
      st.setTokenUsage(sessionId, null);
    };
    window.addEventListener("context-cleared", onContextCleared);
    return () => window.removeEventListener("context-cleared", onContextCleared);
  }, [sessionId, store]);

  return null;
}
