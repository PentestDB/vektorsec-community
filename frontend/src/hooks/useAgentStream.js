import { useCallback, useRef, useState } from "react";
import { connectAgentStream } from "@/services/agent.service";
import { v4 as uuidv4 } from "uuid";

export default function useAgentStream({ sessionId, onComplete }) {
  const [messages, setMessages] = useState([]);
  const [agentState, setAgentState] = useState("idle");
  const [pendingConsent, setPendingConsent] = useState(null);
  const [pendingManualExecution, setPendingManualExecution] = useState(null);
  const controllerRef = useRef(null);
  const streamingAssistantRef = useRef(null);
  const toolCallAccRef = useRef({});

  const flushAssistant = useCallback(() => {
    const ref = streamingAssistantRef.current;
    if (!ref) return;
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

      const stream = await connectAgentStream({ sessionId, message, endpoint });
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
          const ref = streamingAssistantRef.current;
          setMessages((prev) =>
            prev.map((m) => (m.id === ref.id ? { ...m, content: ref.content } : m)),
          );
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
          setMessages((prev) =>
            prev.map((m) =>
              m.id === `tool_${data.id}`
                ? { ...m, content: m.content + data.chunk }
                : m,
            ),
          );
        })
        .onEvent("tool_done", (data) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === `tool_${data.id}`
                ? { ...m, streaming: false, exitCode: data.exitCode }
                : m,
            ),
          );
        })
        .onEvent("tool_error", (data) => {
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
        .onEvent("summary_done", () => {
          // Summary completed, UI can show indicator
        })
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
          if (agentState === "running") {
            setAgentState("idle");
          }
          controllerRef.current = null;
        });
    },
    [sessionId, flushAssistant, onComplete],
  );

  const abort = useCallback(() => {
    controllerRef.current?.abort();
    flushAssistant();
    setAgentState("idle");
  }, [flushAssistant]);

  const loadHistory = useCallback((historyMessages) => {
    setMessages(
      historyMessages.map((m) => ({
        ...m,
        streaming: false,
      })),
    );
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
    startStream,
    abort,
    loadHistory,
  };
}
