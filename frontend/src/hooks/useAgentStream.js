import { useCallback, useEffect } from "react";
import { connectAgentStream } from "@/services/agent.service";
import { v4 as uuidv4 } from "uuid";
import { useAgentStreamStore } from "@/store/agentStream.store";
import { useShallow } from "zustand/react/shallow";

export default function useAgentStream({ sessionId, onComplete }) {
  const store = useAgentStreamStore;

  useEffect(() => {
    store.getState().getOrCreate(sessionId);
  }, [sessionId, store]);

  const { messages, agentState, pendingConsent, pendingManualExecution, subagents } =
    useAgentStreamStore(
      useShallow((state) => {
        const s = state.sessions[sessionId];
        return {
          messages: s?.messages ?? [],
          agentState: s?.agentState ?? "idle",
          pendingConsent: s?.pendingConsent ?? null,
          pendingManualExecution: s?.pendingManualExecution ?? null,
          subagents: s?.subagents ?? [],
        };
      }),
    );

  const refs = useCallback(() => {
    const s = store.getState().getSession(sessionId);
    return s || store.getState().getOrCreate(sessionId);
  }, [sessionId, store]);

  const setMessages = useCallback(
    (updater) => store.getState().setMessages(sessionId, updater),
    [sessionId, store],
  );

  const setAgentState = useCallback(
    (val) => store.getState().setAgentState(sessionId, val),
    [sessionId, store],
  );

  const setPendingConsent = useCallback(
    (val) => store.getState().setPendingConsent(sessionId, val),
    [sessionId, store],
  );

  const setPendingManualExecution = useCallback(
    (val) => store.getState().setPendingManualExecution(sessionId, val),
    [sessionId, store],
  );

  const setSubagents = useCallback(
    (val) => store.getState().setSubagents(sessionId, val),
    [sessionId, store],
  );

  const flushToolOutputBuffer = useCallback(() => {
    const r = refs();
    const buffer = r.toolOutputBufferRef.current;
    const ids = Object.keys(buffer);
    if (ids.length === 0) return;

    setMessages((prev) => {
      let next = prev;
      for (const id of ids) {
        const chunk = buffer[id];
        if (!chunk) continue;
        next = next.map((m) =>
          m.id === id ? { ...m, content: m.content + chunk } : m,
        );
      }
      return next;
    });
    r.toolOutputBufferRef.current = {};
    r.toolOutputRafRef.current = null;
  }, [refs, setMessages]);

  const flushReasoningBuffer = useCallback(() => {
    const r = refs();
    const ref = r.streamingAssistantRef.current;
    if (!ref || r.reasoningBufferRef.current === null) return;
    setMessages((prev) =>
      prev.map((m) => (m.id === ref.id ? { ...m, reasoning: ref.reasoning } : m)),
    );
    r.reasoningBufferRef.current = null;
    r.reasoningRafRef.current = null;
  }, [refs, setMessages]);

  const flushThinkingBuffer = useCallback(() => {
    const r = refs();
    const ref = r.streamingAssistantRef.current;
    if (!ref || r.thinkingBufferRef.current === null) return;
    setMessages((prev) =>
      prev.map((m) => (m.id === ref.id ? { ...m, content: ref.content } : m)),
    );
    r.thinkingBufferRef.current = null;
    r.thinkingRafRef.current = null;
  }, [refs, setMessages]);

  const flushAssistant = useCallback(() => {
    const r = refs();
    const ref = r.streamingAssistantRef.current;
    if (!ref) return;

    if (r.thinkingRafRef.current) {
      cancelAnimationFrame(r.thinkingRafRef.current);
      r.thinkingRafRef.current = null;
      r.thinkingBufferRef.current = null;
    }
    if (r.reasoningRafRef.current) {
      cancelAnimationFrame(r.reasoningRafRef.current);
      r.reasoningRafRef.current = null;
      r.reasoningBufferRef.current = null;
    }

    setMessages((prev) => {
      const existing = prev.find((m) => m.id === ref.id);
      if (existing) {
        return prev.map((m) =>
          m.id === ref.id
            ? { ...m, content: ref.content, reasoning: ref.reasoning || undefined, toolCalls: [...ref.toolCalls], streaming: false, reasoningStreaming: false }
            : m,
        );
      }
      return prev;
    });
    r.streamingAssistantRef.current = null;
  }, [refs, setMessages]);

  const startStream = useCallback(
    async ({ message, endpoint = "message", burpMeta = null }) => {
      setAgentState("running");

      let stream;
      try {
        stream = await connectAgentStream({ sessionId, message, endpoint });
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: `error_${Date.now()}`,
            role: "system",
            content: `Failed to connect to agent: ${err?.message ?? "Unknown error"}`,
            isError: true,
            timestamp: new Date(),
          },
        ]);
        setAgentState("idle");
        return;
      }

      const r = refs();
      r.controllerRef.current = stream;

      stream
        .onEvent("user_message_ack", (data) => {
          setMessages((prev) => [
            ...prev,
            { id: data.id, role: "user", content: message, timestamp: new Date(), ...(burpMeta ? { burpMeta } : {}) },
          ]);
        })
        .onEvent("reasoning", (data) => {
          const r2 = refs();
          if (!r2.streamingAssistantRef.current) {
            const id = uuidv4();
            r2.streamingAssistantRef.current = { id, content: "", reasoning: "", toolCalls: [] };
            setMessages((prev) => [
              ...prev,
              { id, role: "assistant", content: "", reasoning: "", toolCalls: [], streaming: true, reasoningStreaming: true },
            ]);
          }
          r2.streamingAssistantRef.current.reasoning += data.content;
          r2.reasoningBufferRef.current = true;
          if (!r2.reasoningRafRef.current) {
            r2.reasoningRafRef.current = requestAnimationFrame(flushReasoningBuffer);
          }
        })
        .onEvent("thinking", (data) => {
          const r2 = refs();
          if (!r2.streamingAssistantRef.current) {
            const id = uuidv4();
            r2.streamingAssistantRef.current = { id, content: "", reasoning: "", toolCalls: [] };
            setMessages((prev) => [
              ...prev,
              { id, role: "assistant", content: "", toolCalls: [], streaming: true },
            ]);
          }
          if (r2.streamingAssistantRef.current.reasoning) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === r2.streamingAssistantRef.current.id ? { ...m, reasoningStreaming: false } : m,
              ),
            );
          }
          r2.streamingAssistantRef.current.content += data.content;
          r2.thinkingBufferRef.current = true;
          if (!r2.thinkingRafRef.current) {
            r2.thinkingRafRef.current = requestAnimationFrame(flushThinkingBuffer);
          }
        })
        .onEvent("tool_call_start", (data) => {
          refs().toolCallAccRef.current[data.index] = {
            id: data.id,
            name: data.name,
            arguments: "",
          };
        })
        .onEvent("tool_call_args", (data) => {
          const r2 = refs();
          if (r2.toolCallAccRef.current[data.index]) {
            r2.toolCallAccRef.current[data.index].arguments += data.content;
          }
        })
        .onEvent("tool_call_ready", (data) => {
          const r2 = refs();
          const tc = {
            id: data.id,
            name: data.name,
            arguments: data.arguments,
          };
          if (r2.streamingAssistantRef.current) {
            r2.streamingAssistantRef.current.toolCalls.push(tc);
            const ref = r2.streamingAssistantRef.current;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === ref.id ? { ...m, toolCalls: [...ref.toolCalls] } : m,
              ),
            );
          }
          r2.toolCallAccRef.current = {};
        })
        .onEvent("tool_start", (data) => {
          flushAssistant();
          setMessages((prev) => [
            ...prev,
            {
              id: `tool_${data.id}`,
              role: "tool",
              toolCallId: data.id,
              toolName: data.name,
              args: data.args,
              content: "",
              streaming: true,
              timestamp: new Date(),
            },
          ]);
        })
        .onEvent("tool_output", (data) => {
          const r2 = refs();
          const key = `tool_${data.id}`;
          r2.toolOutputBufferRef.current[key] =
            (r2.toolOutputBufferRef.current[key] ?? "") + data.chunk;
          if (!r2.toolOutputRafRef.current) {
            r2.toolOutputRafRef.current = requestAnimationFrame(flushToolOutputBuffer);
          }
        })
        .onEvent("tool_done", (data) => {
          const r2 = refs();
          if (r2.toolOutputRafRef.current) {
            cancelAnimationFrame(r2.toolOutputRafRef.current);
            flushToolOutputBuffer();
          }
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== `tool_${data.id}`) return m;
              const useServerOutput = data.output && (!m.content || m.content.length === 0);
              return {
                ...m,
                content: useServerOutput ? data.output : m.content,
                streaming: false,
                exitCode: data.exitCode,
              };
            }),
          );
        })
        .onEvent("tool_error", (data) => {
          const r2 = refs();
          if (r2.toolOutputRafRef.current) {
            cancelAnimationFrame(r2.toolOutputRafRef.current);
            r2.toolOutputBufferRef.current = {};
            r2.toolOutputRafRef.current = null;
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === `tool_${data.id}`
                ? { ...m, content: data.error, streaming: false, exitCode: 1 }
                : m,
            ),
          );
        })
        .onEvent("consent_required", (data) => {
          flushAssistant();
          setPendingConsent({
            toolCallId: data.id,
            toolName: data.name,
            args: data.args,
            safetyBlock: data.safetyBlock ?? false,
          });
          setAgentState("waiting_consent");
        })
        .onEvent("manual_execution_required", (data) => {
          flushAssistant();
          setPendingManualExecution({
            toolCallId: data.id,
            toolName: data.name,
            command: data.command,
          });
          setAgentState("waiting_manual_execution");
        })
        .onEvent("subagent_spawned", (data) => {
          setSubagents((prev) => [
            ...prev,
            {
              subagentId: data.subagentId,
              task: data.task,
              parentId: data.parentId,
              status: "running",
              thinkingContent: "",
              toolCalls: [],
              createdAt: new Date(),
            },
          ]);
          setMessages((prev) => [
            ...prev,
            {
              id: `subagent_${data.subagentId}`,
              role: "subagent",
              subagentId: data.subagentId,
              task: data.task,
              status: "running",
              content: "",
              timestamp: new Date(),
            },
          ]);
        })
        .onEvent("subagent_progress", (data) => {
          setSubagents((prev) =>
            prev.map((s) => {
              if (s.subagentId !== data.subagentId) return s;
              if (data.type === "thinking") {
                return { ...s, thinkingContent: s.thinkingContent + data.content };
              }
              if (data.type === "tool_start" || data.type === "tool_done" || data.type === "tool_call_start") {
                return { ...s, toolCalls: [...s.toolCalls, { type: data.type, content: data.content }] };
              }
              return s;
            }),
          );
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== `subagent_${data.subagentId}`) return m;
              if (data.type === "thinking") {
                return { ...m, content: m.content + data.content };
              }
              return m;
            }),
          );
        })
        .onEvent("subagent_completed", (data) => {
          setSubagents((prev) =>
            prev.map((s) =>
              s.subagentId === data.subagentId
                ? { ...s, status: "completed", result: data.result }
                : s,
            ),
          );
          setMessages((prev) =>
            prev.map((m) =>
              m.id === `subagent_${data.subagentId}`
                ? { ...m, status: "completed", result: data.result }
                : m,
            ),
          );
        })
        .onEvent("subagent_failed", (data) => {
          setSubagents((prev) =>
            prev.map((s) =>
              s.subagentId === data.subagentId
                ? { ...s, status: "failed", error: data.error }
                : s,
            ),
          );
          setMessages((prev) =>
            prev.map((m) =>
              m.id === `subagent_${data.subagentId}`
                ? { ...m, status: "failed", error: data.error }
                : m,
            ),
          );
        })
        .onEvent("slash_command_ack", (data) => {
          setMessages((prev) => [
            ...prev,
            {
              id: `slash_ack_${Date.now()}`,
              role: "system",
              content: data.message,
              isSlashCommand: true,
              timestamp: new Date(),
            },
          ]);
        })
        .onEvent("slash_command_result", (data) => {
          if (data.action === "clear_messages") {
            setMessages([]);
          }
          if (data.action === "reset_state") {
            setAgentState("idle");
          }
          const id = data.id || `slash_result_${Date.now()}`;
          const r2 = refs();
          if (data.streaming) {
            r2.slashStreamRef.current = { id, content: data.content || "" };
          }
          setMessages((prev) => [
            ...prev,
            {
              id,
              role: "slash_command_result",
              command: data.command,
              content: data.content,
              success: data.success,
              streaming: !!data.streaming,
              timestamp: new Date(),
            },
          ]);
        })
        .onEvent("slash_command_stream", (data) => {
          const r2 = refs();
          const ref = r2.slashStreamRef.current;
          if (ref && ref.id === data.id) {
            ref.content += data.content;
            const snapshot = ref.content;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === data.id ? { ...m, content: snapshot } : m,
              ),
            );
          }
        })
        .onEvent("slash_command_done", (data) => {
          const r2 = refs();
          const finalContent = r2.slashStreamRef.current?.content || data.content;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === data.id
                ? { ...m, content: finalContent, streaming: false }
                : m,
            ),
          );
          r2.slashStreamRef.current = null;
        })
        .onEvent("summarizing", (data) => {
          setMessages((prev) => [
            ...prev,
            {
              id: `summarize_${Date.now()}`,
              role: "system",
              content: data.message,
              isSummary: true,
              timestamp: new Date(),
            },
          ]);
        })
        .onEvent("summary_done", () => {})
        .onEvent("paused", () => {
          flushAssistant();
          setAgentState("paused");
        })
        .onEvent("error", (data) => {
          flushAssistant();
          setMessages((prev) => [
            ...prev,
            {
              id: `error_${Date.now()}`,
              role: "system",
              content: `Error: ${data.message}`,
              isError: true,
              timestamp: new Date(),
            },
          ]);
        })
        .onEvent("done", () => {
          flushAssistant();
          setAgentState("idle");
          onComplete?.();
        })
        .onEvent("_stream_end", () => {
          flushAssistant();
          setAgentState((prev) => {
            if (prev === "running") return "idle";
            return prev;
          });
          refs().controllerRef.current = null;
        });
    },
    [sessionId, refs, setMessages, setAgentState, setPendingConsent, setPendingManualExecution, setSubagents, flushAssistant, flushToolOutputBuffer, flushThinkingBuffer, flushReasoningBuffer, onComplete],
  );

  const abort = useCallback(() => {
    const r = refs();
    r.controllerRef.current?.abort();
    flushAssistant();
    setAgentState("idle");
  }, [refs, flushAssistant, setAgentState]);

  const loadHistory = useCallback(
    (historyMessages, historySubagents) => {
      store.getState().loadHistory(sessionId, historyMessages, historySubagents);
    },
    [sessionId, store],
  );

  return {
    messages,
    setMessages,
    agentState,
    setAgentState,
    pendingConsent,
    setPendingConsent,
    pendingManualExecution,
    setPendingManualExecution,
    subagents,
    setSubagents,
    startStream,
    abort,
    loadHistory,
  };
}
