import { useCallback, useRef, useState } from "react";
import { connectAgentStream } from "@/services/agent.service";
import { v4 as uuidv4 } from "uuid";

export default function useAgentStream({ sessionId, onComplete, onShellSpawned }) {
  const [messages, setMessages] = useState([]);
  const [agentState, setAgentState] = useState("idle");
  const [pendingConsent, setPendingConsent] = useState(null);
  const [pendingManualExecution, setPendingManualExecution] = useState(null);
  const [subagents, setSubagents] = useState([]);
  const controllerRef = useRef(null);
  const streamingAssistantRef = useRef(null);
  const toolCallAccRef = useRef({});
  const toolOutputBufferRef = useRef({});
  const toolOutputRafRef = useRef(null);
  const thinkingBufferRef = useRef(null);
  const thinkingRafRef = useRef(null);

  const flushToolOutputBuffer = useCallback(() => {
    const buffer = toolOutputBufferRef.current;
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
    toolOutputBufferRef.current = {};
    toolOutputRafRef.current = null;
  }, []);

  const flushThinkingBuffer = useCallback(() => {
    const ref = streamingAssistantRef.current;
    if (!ref || thinkingBufferRef.current === null) return;
    setMessages((prev) =>
      prev.map((m) => (m.id === ref.id ? { ...m, content: ref.content } : m)),
    );
    thinkingBufferRef.current = null;
    thinkingRafRef.current = null;
  }, []);

  const flushAssistant = useCallback(() => {
    const ref = streamingAssistantRef.current;
    if (!ref) return;

    if (thinkingRafRef.current) {
      cancelAnimationFrame(thinkingRafRef.current);
      thinkingRafRef.current = null;
      thinkingBufferRef.current = null;
    }

    setMessages((prev) => {
      const existing = prev.find((m) => m.id === ref.id);
      if (existing) {
        return prev.map((m) =>
          m.id === ref.id
            ? { ...m, content: ref.content, toolCalls: [...ref.toolCalls], streaming: false }
            : m,
        );
      }
      return prev;
    });
    streamingAssistantRef.current = null;
  }, []);

  const startStream = useCallback(
    async ({ message, endpoint = "message" }) => {
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
      controllerRef.current = stream;

      stream
        .onEvent("user_message_ack", (data) => {
          setMessages((prev) => [
            ...prev,
            { id: data.id, role: "user", content: message, timestamp: new Date() },
          ]);
        })
        .onEvent("thinking", (data) => {
          if (!streamingAssistantRef.current) {
            const id = uuidv4();
            streamingAssistantRef.current = { id, content: "", toolCalls: [] };
            setMessages((prev) => [
              ...prev,
              { id, role: "assistant", content: "", toolCalls: [], streaming: true },
            ]);
          }
          streamingAssistantRef.current.content += data.content;
          thinkingBufferRef.current = true;
          if (!thinkingRafRef.current) {
            thinkingRafRef.current = requestAnimationFrame(flushThinkingBuffer);
          }
        })
        .onEvent("tool_call_start", (data) => {
          toolCallAccRef.current[data.index] = {
            id: data.id,
            name: data.name,
            arguments: "",
          };
        })
        .onEvent("tool_call_args", (data) => {
          if (toolCallAccRef.current[data.index]) {
            toolCallAccRef.current[data.index].arguments += data.content;
          }
        })
        .onEvent("tool_call_ready", (data) => {
          const tc = {
            id: data.id,
            name: data.name,
            arguments: data.arguments,
          };
          if (streamingAssistantRef.current) {
            streamingAssistantRef.current.toolCalls.push(tc);
            const ref = streamingAssistantRef.current;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === ref.id ? { ...m, toolCalls: [...ref.toolCalls] } : m,
              ),
            );
          }
          toolCallAccRef.current = {};
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
          const key = `tool_${data.id}`;
          toolOutputBufferRef.current[key] =
            (toolOutputBufferRef.current[key] ?? "") + data.chunk;
          if (!toolOutputRafRef.current) {
            toolOutputRafRef.current = requestAnimationFrame(flushToolOutputBuffer);
          }
        })
        .onEvent("tool_done", (data) => {
          if (toolOutputRafRef.current) {
            cancelAnimationFrame(toolOutputRafRef.current);
            flushToolOutputBuffer();
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === `tool_${data.id}`
                ? { ...m, streaming: false, exitCode: data.exitCode }
                : m,
            ),
          );
        })
        .onEvent("tool_error", (data) => {
          if (toolOutputRafRef.current) {
            cancelAnimationFrame(toolOutputRafRef.current);
            toolOutputBufferRef.current = {};
            toolOutputRafRef.current = null;
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
        // Subagent events
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
            if (prev === "running") {
              return "idle";
            }
            return prev;
          });
          controllerRef.current = null;
        });
    },
    [sessionId, flushAssistant, flushToolOutputBuffer, flushThinkingBuffer, onComplete],
  );

  const abort = useCallback(() => {
    controllerRef.current?.abort();
    flushAssistant();
    setAgentState("idle");
  }, [flushAssistant]);

  const loadHistory = useCallback((historyMessages, historySubagents) => {
    setMessages(
      historyMessages.map((m) => ({
        ...m,
        streaming: false,
      })),
    );
    if (historySubagents) {
      setSubagents(historySubagents);
    }
  }, []);

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
