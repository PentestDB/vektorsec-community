"use client";

import React, { useEffect, useRef, useMemo, useState, useCallback } from "react";
import {
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  TrophyOutlined,
  ThunderboltFilled,
  ArrowLeftOutlined,
  DownOutlined,
} from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useAgentStreamStore } from "@/store/agentStream.store";
import ChatMessage from "./ChatMessage";
import styles from "@/styles/components/Chat.module.scss";

const STATUS_CONFIG = {
  running: { icon: <LoadingOutlined spin />, color: "#58a6ff", label: "Running" },
  completed: { icon: <CheckCircleOutlined />, color: "#7ee787", label: "Completed" },
  failed: { icon: <CloseCircleOutlined />, color: "#f85149", label: "Failed" },
  cancelled: { icon: <CloseCircleOutlined />, color: "#d29922", label: "Cancelled" },
  timed_out: { icon: <CloseCircleOutlined />, color: "#d29922", label: "Timed Out" },
};

function buildChatMessages(agent) {
  const rawMsgs = agent?.messages || [];
  const chatMsgs = [];
  let id = 0;
  const isRunning = agent?.status === "running";

  const useLegacy = rawMsgs.length === 0;
  const entries = useLegacy ? buildLegacyEntries(agent) : rawMsgs;

  let currentAssistant = null;

  const flushAssistant = () => {
    if (currentAssistant) {
      chatMsgs.push(currentAssistant);
      currentAssistant = null;
    }
  };

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const isLast = i === entries.length - 1;

    if (entry.type === "thinking") {
      if (!currentAssistant) {
        currentAssistant = {
          id: `racer_${id++}`,
          role: "assistant",
          content: "",
          reasoning: entry.content,
          reasoningStreaming: isLast && isRunning,
          toolCalls: [],
        };
      } else {
        currentAssistant.reasoning = (currentAssistant.reasoning || "") + entry.content;
        currentAssistant.reasoningStreaming = isLast && isRunning;
      }
    } else if (entry.type === "assistant") {
      if (!currentAssistant) {
        currentAssistant = {
          id: `racer_${id++}`,
          role: "assistant",
          content: entry.content,
          streaming: isLast && isRunning,
          toolCalls: [],
        };
      } else {
        currentAssistant.content = (currentAssistant.content || "") + entry.content;
        currentAssistant.streaming = isLast && isRunning;
        currentAssistant.reasoningStreaming = false;
      }
    } else if (entry.type === "tool") {
      if (!currentAssistant) {
        currentAssistant = {
          id: `racer_${id++}`,
          role: "assistant",
          content: "",
          toolCalls: [],
        };
      }
      currentAssistant.reasoningStreaming = false;

      const toolCallId = `racer_tc_${id++}`;
      const argsStr = typeof entry.args === "string" ? entry.args : JSON.stringify(entry.args ?? {});

      currentAssistant.toolCalls.push({
        id: toolCallId,
        name: entry.name,
        arguments: argsStr,
      });

      chatMsgs.push(currentAssistant);
      currentAssistant = null;

      chatMsgs.push({
        id: `tool_${toolCallId}`,
        role: "tool",
        toolCallId,
        toolName: entry.name,
        args: argsStr,
        content: entry.output || "",
        streaming: entry.status === "running" && isLast && isRunning,
        exitCode: entry.status === "done" ? (entry.exitCode ?? 0) : undefined,
      });
    }
  }

  flushAssistant();
  return chatMsgs;
}

function buildLegacyEntries(agent) {
  const entries = [];
  if (agent?.thinkingContent) {
    entries.push({ type: "thinking", content: agent.thinkingContent });
  }
  if (agent?.toolCalls?.length) {
    for (const tc of agent.toolCalls) {
      if (tc.name) {
        entries.push({
          type: "tool",
          name: tc.name,
          args: tc.args,
          status: tc.status || "done",
          output: tc.output || "",
          exitCode: tc.exitCode,
        });
      }
    }
  }
  return entries;
}

export default function RacerChatView({ sessionId, racerId }) {
  const router = useRouter();
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const FAR_UP_THRESHOLD = 250;

  const agent = useAgentStreamStore((state) => {
    const swarms = state.sessions[sessionId]?.swarms;
    if (!swarms) return null;
    for (const sw of swarms) {
      const found = (sw.agents || []).find((a) => a.agentId === racerId);
      if (found) return found;
    }
    return null;
  });

  const isWinner = useAgentStreamStore((state) => {
    const swarms = state.sessions[sessionId]?.swarms;
    if (!swarms) return false;
    for (const sw of swarms) {
      if (sw.winner === racerId) return true;
    }
    return false;
  });

  const statusCfg = STATUS_CONFIG[agent?.status] || STATUS_CONFIG.running;

  const chatMessages = useMemo(() => buildChatMessages(agent), [agent]);

  const scrollToBottom = useCallback((behavior = "auto") => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const updateStickToBottom = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldStickToBottomRef.current = distFromBottom < 150;
    setShowScrollBtn(distFromBottom > FAR_UP_THRESHOLD);
  }, []);

  useEffect(() => {
    if (shouldStickToBottomRef.current) {
      scrollToBottom();
    }
  }, [chatMessages, scrollToBottom]);

  if (!agent) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", height: "100%",
        color: "#484f58", gap: 12,
      }}>
        <ThunderboltFilled style={{ fontSize: 32, opacity: 0.3 }} />
        <span style={{ fontSize: 13 }}>Racer not found</span>
        <button
          onClick={() => router.push(`/session/${sessionId}`)}
          style={{
            background: "none", border: "1px solid #30363d",
            color: "#8b949e", padding: "6px 14px",
            borderRadius: 6, cursor: "pointer", fontSize: 12,
          }}
        >
          Back to Session
        </button>
      </div>
    );
  }

  return (
    <div className={styles.chatContainer}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 16px",
        borderBottom: "1px solid var(--border-primary, #21262d)",
        backgroundColor: "var(--bg-secondary, #010409)",
        flexShrink: 0,
      }}>
        <button
          onClick={() => router.push(`/session/${sessionId}`)}
          style={{
            background: "none", border: "none",
            color: "var(--secondary-text, #8b949e)", cursor: "pointer",
            display: "flex", alignItems: "center",
            padding: 4, borderRadius: 4,
          }}
          title="Back to session"
        >
          <ArrowLeftOutlined style={{ fontSize: 13 }} />
        </button>

        <ThunderboltFilled style={{ color: "#f0c000", fontSize: 13 }} />

        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12, fontWeight: 600,
          color: "#58a6ff",
          padding: "2px 8px", borderRadius: 4,
          backgroundColor: "#1f6feb18", border: "1px solid #1f6feb30",
        }}>
          {agent.model || racerId.slice(0, 8)}
        </span>

        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          fontSize: 11, color: statusCfg.color,
          padding: "2px 8px", borderRadius: 6,
          backgroundColor: `${statusCfg.color}12`,
        }}>
          {statusCfg.icon}
          <span>{statusCfg.label}</span>
        </span>

        {isWinner && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            fontSize: 11, color: "#f0c000",
            padding: "2px 8px", borderRadius: 6,
            backgroundColor: "#f0c00012",
          }}>
            <TrophyOutlined /> Winner
          </span>
        )}

        {agent.task && (
          <>
            <span style={{ color: "var(--border-primary, #30363d)" }}>|</span>
            <span style={{ fontSize: 11, color: "var(--secondary-text, #8b949e)", fontStyle: "italic" }}>
              {agent.task.length > 80 ? agent.task.slice(0, 80) + "..." : agent.task}
            </span>
          </>
        )}
      </div>

      {/* Messages area — same scroll behavior as ChatView */}
      <div
        className={styles.messagesArea}
        ref={messagesContainerRef}
        onScroll={updateStickToBottom}
      >
        {chatMessages.length === 0 && !agent.result && agent.status === "running" && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "24px 16px",
            color: "#484f58", fontSize: 13,
          }}>
            <LoadingOutlined spin style={{ fontSize: 14 }} />
            <span>Racer is starting up...</span>
          </div>
        )}

        {chatMessages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} allMessages={chatMessages} />
        ))}

        {agent.result && (
          <div className={styles.message}>
            <div className={styles.assistantMessage}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                marginBottom: 8, fontSize: 11, fontWeight: 600,
                color: "#7ee787", fontFamily: "'JetBrains Mono', monospace",
              }}>
                <CheckCircleOutlined style={{ fontSize: 11 }} />
                RESULT
              </div>
              <div style={{ color: "var(--primary-text, #c9d1d9)" }}>
                {agent.result}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {showScrollBtn && (
        <button
          type="button"
          onClick={() => scrollToBottom("smooth")}
          title="Scroll to latest"
          className={styles.scrollToBottomBtn}
        >
          <DownOutlined />
          <span>scroll to latest</span>
        </button>
      )}
    </div>
  );
}
