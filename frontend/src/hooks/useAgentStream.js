import { useCallback, useEffect, useMemo } from "react";
import { connectAgentStream } from "@/services/agent.service";
import { v4 as uuidv4 } from "uuid";
import { useAgentStreamStore } from "@/store/agentStream.store";
import { useShallow } from "zustand/react/shallow";
import { notification } from "antd";

const EMPTY_MESSAGES = [];
const EMPTY_SUBAGENTS = [];
const EMPTY_SWARMS = [];
const DEFAULT_STATE = {
  messages: EMPTY_MESSAGES,
  agentState: "idle",
  pendingConsent: null,
  pendingManualExecution: null,
  subagents: EMPTY_SUBAGENTS,
  swarms: EMPTY_SWARMS,
  tokenUsage: null,
};

export default function useAgentStream({
  sessionId,
  onComplete,
  onInstallSuggestion,
  onIterationLimit,
}) {
  const store = useAgentStreamStore;

  useEffect(() => {
    store.getState().getOrCreate(sessionId);
  }, [sessionId, store]);

  const { messages, agentState, pendingConsent, pendingManualExecution, subagents, swarms, tokenUsage } =
    useAgentStreamStore(
      useShallow((state) => {
        const s = state.sessions[sessionId];
        if (!s) return DEFAULT_STATE;
        return {
          messages: s.messages ?? EMPTY_MESSAGES,
          agentState: s.agentState ?? "idle",
          pendingConsent: s.pendingConsent ?? null,
          pendingManualExecution: s.pendingManualExecution ?? null,
          subagents: s.subagents ?? EMPTY_SUBAGENTS,
          swarms: s.swarms ?? EMPTY_SWARMS,
          tokenUsage: s.tokenUsage ?? null,
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

  const setSwarms = useCallback(
    (val) => store.getState().setSwarms(sessionId, val),
    [sessionId, store],
  );

  const setTokenUsage = useCallback(
    (val) => store.getState().setTokenUsage(sessionId, val),
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
        const errMsg = err?.message ?? "Unknown error";
        notification.error({
          message: "Connection Failed",
          description: `Failed to connect to agent: ${errMsg}`,
          duration: 6,
          placement: "bottomRight",
        });
        setMessages((prev) => [
          ...prev,
          {
            id: `error_${Date.now()}`,
            role: "system",
            content: `Failed to connect to agent: ${errMsg}`,
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
          const r2 = refs();
          r2.toolNameMapRef.current[data.id] = data.name;

          if (data.name === "browser_action") {
            notification.info({
              message: "Browser Agent",
              description: `Running: ${data.args?.goal || data.args?.action || "browser action"}`,
              duration: 4,
              placement: "bottomRight",
            });
          }

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

          const toolName = r2.toolNameMapRef.current[data.id];
          if (toolName === "browser_action") {
            const output = data.output || "";
            const isXServerError = /X server|XServer|Missing X server|\$DISPLAY|headed browser/i.test(output);
            if (data.exitCode !== 0) {
              notification.error({
                message: "Browser Agent Failed",
                description: isXServerError
                  ? "Missing X server or display. Set up VNC for headed mode, or enable headless in Settings → Magnitude."
                  : output.length > 200 ? output.slice(0, 200) + "…" : output,
                duration: 8,
                placement: "bottomRight",
              });
            } else {
              notification.success({
                message: "Browser Agent",
                description: output.length > 200 ? output.slice(0, 200) + "…" : (output || "Action completed successfully"),
                duration: 5,
                placement: "bottomRight",
              });
            }
            delete r2.toolNameMapRef.current[data.id];
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

          const toolName = r2.toolNameMapRef.current[data.id];
          if (toolName === "browser_action") {
            const errMsg = data.error || "Unknown error";
            const isXServerError = /X server|XServer|Missing X server|\$DISPLAY|headed browser/i.test(errMsg);
            notification.error({
              message: "Browser Agent Error",
              description: isXServerError
                ? "Missing X server or display. Set up VNC for headed mode, or enable headless in Settings → Magnitude."
                : errMsg.length > 200 ? errMsg.slice(0, 200) + "…" : errMsg,
              duration: 8,
              placement: "bottomRight",
            });
            delete r2.toolNameMapRef.current[data.id];
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
            approvalReason: data.approvalReason,
            batch: data.batch,
          });
          setAgentState("waiting_consent");
        })
        .onEvent("install_suggestion", (data) => {
          onInstallSuggestion?.(data);
        })
        .onEvent("iteration_limit", (data) => {
          flushAssistant();
          onIterationLimit?.(data);
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
          const MAX_THINKING = 20_000;
          setSubagents((prev) =>
            prev.map((s) => {
              if (s.subagentId !== data.subagentId) return s;
              if (data.type === "thinking") {
                const full = s.thinkingContent + data.content;
                return { ...s, thinkingContent: full.length > MAX_THINKING ? full.slice(-MAX_THINKING) : full };
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
        .onEvent("swarm_spawned", (data) => {
          setSwarms((prev) => {
            const nextSwarm = {
              swarmId: data.swarmId,
              goal: data.goal,
              winCondition: data.winCondition,
              status: "running",
              agents: data.agents.map((a) => ({
                agentId: a.agentId,
                task: a.task,
                model: a.model,
                status: "running",
                thinkingContent: "",
                toolCalls: [],
                messages: [],
              })),
              findings: [],
              createdAt: new Date(),
            };
            const existingIdx = prev.findIndex((sw) => sw.swarmId === data.swarmId);
            if (existingIdx === -1) return [...prev, nextSwarm];
            return prev.map((sw) => (sw.swarmId === data.swarmId ? { ...sw, ...nextSwarm } : sw));
          });
          setMessages((prev) => {
            const nextSwarmMsg = {
              id: `swarm_${data.swarmId}`,
              role: "swarm",
              swarmId: data.swarmId,
              goal: data.goal,
              winCondition: data.winCondition,
              agents: data.agents,
              status: "running",
              content: "",
              timestamp: new Date(),
            };
            const existingIdx = prev.findIndex((m) => m.id === `swarm_${data.swarmId}`);
            if (existingIdx === -1) return [...prev, nextSwarmMsg];
            return prev.map((m) => (m.id === `swarm_${data.swarmId}` ? { ...m, ...nextSwarmMsg } : m));
          });
        })
        .onEvent("swarm_agent_progress", (data) => {
          // Buffer all racer progress events and flush on the next animation frame
          // to avoid O(N) Zustand clones per SSE chunk.
          const r2 = refs();
          r2.swarmProgressBufferRef.current.push(data);
          if (!r2.swarmProgressRafRef.current) {
            r2.swarmProgressRafRef.current = requestAnimationFrame(() => {
              const batch = r2.swarmProgressBufferRef.current;
              r2.swarmProgressBufferRef.current = [];
              r2.swarmProgressRafRef.current = null;
              if (batch.length === 0) return;
              // Cap strings to avoid unbounded memory growth.
              const MAX_OUTPUT = 32_000;   // 32 KB per live tool call
              const MAX_THINKING = 20_000; // 20 KB per thinking block
              setSwarms((prev) =>
                prev.map((sw) => {
                  const events = batch.filter((d) => d.swarmId === sw.swarmId);
                  if (events.length === 0) return sw;
                  return {
                    ...sw,
                    agents: sw.agents.map((a) => {
                      const agentEvents = events.filter((d) => d.agentId === a.agentId);
                      if (agentEvents.length === 0) return a;

                      let updated = a;
                      for (const data of agentEvents) {
                        const msgs = [...(updated.messages || [])];

                        if (data.type === "thinking" || data.type === "reasoning") {
                          const last = msgs[msgs.length - 1];
                          if (last && last.type === "thinking") {
                            const next = last.content + data.content;
                            msgs[msgs.length - 1] = { ...last, content: next.length > MAX_THINKING ? next.slice(-MAX_THINKING) : next };
                          } else {
                            msgs.push({ type: "thinking", content: data.content });
                          }
                          const full = (updated.thinkingContent || "") + data.content;
                          updated = { ...updated, thinkingContent: full.length > MAX_THINKING ? full.slice(-MAX_THINKING) : full, messages: msgs };
                          continue;
                        }

                        if (data.type === "assistant_text") {
                          const last = msgs[msgs.length - 1];
                          if (last && last.type === "assistant") {
                            msgs[msgs.length - 1] = { ...last, content: last.content + data.content };
                          } else {
                            msgs.push({ type: "assistant", content: data.content });
                          }
                          updated = { ...updated, messages: msgs };
                          continue;
                        }

                        if (data.type === "tool_start") {
                          try {
                            const parsed = JSON.parse(data.content);
                            msgs.push({ type: "tool", name: parsed.name, args: parsed.args, status: "running", output: "" });
                            updated = { ...updated, toolCalls: [...updated.toolCalls, { name: parsed.name, args: parsed.args, status: "running" }], messages: msgs };
                          } catch { /* ignore */ }
                          continue;
                        }

                        if (data.type === "tool_done") {
                          try {
                            const parsed = JSON.parse(data.content);
                            const updatedCalls = [...updated.toolCalls];
                            const idx = updatedCalls.findLastIndex((tc) => tc.name === parsed.name && tc.status === "running");
                            if (idx >= 0) {
                              updatedCalls[idx] = { ...updatedCalls[idx], status: "done", output: parsed.output || "", exitCode: parsed.exitCode };
                            }
                            const msgIdx = msgs.findLastIndex((m) => m.type === "tool" && m.name === parsed.name && m.status === "running");
                            if (msgIdx >= 0) {
                              msgs[msgIdx] = { ...msgs[msgIdx], status: "done", output: parsed.output || msgs[msgIdx].output || "", exitCode: parsed.exitCode };
                            }
                            updated = { ...updated, toolCalls: updatedCalls, messages: msgs };
                          } catch { /* ignore */ }
                          continue;
                        }

                        if (data.type === "tool_output") {
                          const updatedCalls = [...updated.toolCalls];
                          if (updatedCalls.length > 0) {
                            const last = updatedCalls[updatedCalls.length - 1];
                            const next = (last.output || "") + data.content;
                            updatedCalls[updatedCalls.length - 1] = { ...last, output: next.length > MAX_OUTPUT ? next.slice(-MAX_OUTPUT) : next };
                          }
                          const msgIdx = msgs.findLastIndex((m) => m.type === "tool" && m.status === "running");
                          if (msgIdx >= 0) {
                            const next = (msgs[msgIdx].output || "") + data.content;
                            msgs[msgIdx] = { ...msgs[msgIdx], output: next.length > MAX_OUTPUT ? next.slice(-MAX_OUTPUT) : next };
                          }
                          updated = { ...updated, toolCalls: updatedCalls, messages: msgs };
                          continue;
                        }

                        if (data.type === "tool_call_start" || data.type === "tool_call_ready") {
                          updated = { ...updated, toolCalls: [...updated.toolCalls, { type: data.type, content: data.content }] };
                          continue;
                        }
                      }
                      return updated;
                    }),
                  };
                }),
              );
            });
          }

          // Racer chat is rendered separately in RacerChatView; do not mirror into orchestrator messages.
        })
        .onEvent("swarm_finding", (data) => {
          setSwarms((prev) =>
            prev.map((sw) => {
              if (sw.swarmId !== data.swarmId) return sw;
              return {
                ...sw,
                findings: [
                  ...sw.findings,
                  { agentId: data.agentId, finding: data.finding, isSuccess: data.isSuccess },
                ],
              };
            }),
          );
        })
        .onEvent("swarm_agent_completed", (data) => {
          setSwarms((prev) =>
            prev.map((sw) => {
              if (sw.swarmId !== data.swarmId) return sw;
              return {
                ...sw,
                ...(data.isWinner ? { winner: data.agentId } : {}),
                agents: sw.agents.map((a) =>
                  a.agentId === data.agentId
                    ? { ...a, status: data.status, result: data.result }
                    : a,
                ),
              };
            }),
          );
        })
        .onEvent("swarm_agent_token_usage", (data) => {
          setSwarms((prev) =>
            prev.map((sw) => {
              if (sw.swarmId !== data.swarmId) return sw;
              return {
                ...sw,
                agents: sw.agents.map((a) =>
                  a.agentId === data.agentId
                    ? {
                      ...a,
                      tokenUsage: {
                        totalTokens: data.totalTokens,
                        promptTokens: data.promptTokens,
                        completionTokens: data.completionTokens,
                        contextLimit: data.contextLimit,
                        iteration: data.iteration,
                        maxIterations: data.maxIterations,
                      },
                    }
                    : a,
                ),
              };
            }),
          );
        })
        .onEvent("swarm_paused", (data) => {
          setSwarms((prev) =>
            prev.map((sw) => {
              if (sw.swarmId !== data.swarmId) return sw;
              return {
                ...sw,
                status: "paused",
                agents: sw.agents.map((a) =>
                  a.status === "running" ? { ...a, status: "paused" } : a,
                ),
              };
            }),
          );
        })
        .onEvent("swarm_completed", (data) => {
          setSwarms((prev) =>
            prev.map((sw) => {
              if (sw.swarmId !== data.swarmId) return sw;
              return {
                ...sw,
                status: data.status,
                winner: data.winner,
                agents: sw.agents.map((a) =>
                  a.status === "running"
                    ? { ...a, status: "cancelled" }
                    : a,
                ),
              };
            }),
          );
          setMessages((prev) =>
            prev.map((m) =>
              m.id === `swarm_${data.swarmId}`
                ? { ...m, status: data.status, winner: data.winner, result: data.summary }
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
        .onEvent("token_usage", (data) => {
          setTokenUsage({
            totalTokens: data.totalTokens,
            promptTokens: data.promptTokens,
            completionTokens: data.completionTokens,
            contextLimit: data.contextLimit,
            iteration: data.iteration,
            maxIterations: data.maxIterations,
          });
        })
        .onEvent("summary_done", () => {})
        .onEvent("paused", () => {
          flushAssistant();
          setAgentState("paused");
        })
        .onEvent("error", (data) => {
          flushAssistant();
          notification.error({
            message: "Agent Error",
            description: data.message?.length > 200 ? data.message.slice(0, 200) + "…" : data.message,
            duration: 6,
            placement: "bottomRight",
          });
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
          const r2 = refs();
          if (r2.swarmProgressRafRef.current) {
            cancelAnimationFrame(r2.swarmProgressRafRef.current);
            r2.swarmProgressRafRef.current = null;
            r2.swarmProgressBufferRef.current = [];
          }
          setAgentState("idle");
          onComplete?.();
        })
        .onEvent("_stream_end", () => {
          flushAssistant();
          const r2 = refs();
          if (r2.swarmProgressRafRef.current) {
            cancelAnimationFrame(r2.swarmProgressRafRef.current);
            r2.swarmProgressRafRef.current = null;
            r2.swarmProgressBufferRef.current = [];
          }
          setAgentState((prev) => {
            if (prev === "running") return "idle";
            return prev;
          });
          refs().controllerRef.current = null;
        });
    },
    [sessionId, refs, setMessages, setAgentState, setPendingConsent, setPendingManualExecution, setSubagents, setSwarms, setTokenUsage, flushAssistant, flushToolOutputBuffer, flushThinkingBuffer, flushReasoningBuffer, onComplete, onInstallSuggestion, onIterationLimit],
  );

  const abort = useCallback(() => {
    const r = refs();
    r.controllerRef.current?.abort();
    flushAssistant();
    setAgentState("idle");
  }, [refs, flushAssistant, setAgentState]);

  const loadHistory = useCallback(
    (historyMessages, historySubagents, historySwarms) => {
      store.getState().loadHistory(sessionId, historyMessages, historySubagents, historySwarms);
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
    swarms,
    setSwarms,
    tokenUsage,
    setTokenUsage,
    startStream,
    abort,
    loadHistory,
  };
}
