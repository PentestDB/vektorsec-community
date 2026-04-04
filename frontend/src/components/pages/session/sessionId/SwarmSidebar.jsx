"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  TrophyOutlined,
  RobotOutlined,
  DoubleLeftOutlined,
  DoubleRightOutlined,
  ThunderboltFilled,
  ToolOutlined,
  BulbOutlined,
} from "@ant-design/icons";
import ReactMarkdown from "react-markdown";
import { useAgentStreamStore } from "@/store/agentStream.store";

const EMPTY_SWARMS = [];

const STATUS_CONFIG = {
  running: { icon: <LoadingOutlined spin />, color: "#58a6ff", label: "Running" },
  completed: { icon: <CheckCircleOutlined />, color: "#7ee787", label: "Done" },
  failed: { icon: <CloseCircleOutlined />, color: "#f85149", label: "Failed" },
  cancelled: { icon: <CloseCircleOutlined />, color: "#d29922", label: "Cancelled" },
  timed_out: { icon: <CloseCircleOutlined />, color: "#d29922", label: "Timeout" },
};

function ToolCallEntry({ tc }) {
  const [expanded, setExpanded] = useState(false);
  const statusColor = tc.status === "done" ? "#7ee787" : tc.status === "error" ? "#f85149" : "#58a6ff";

  return (
    <div style={{ marginBottom: 4 }}>
      <div
        onClick={() => tc.output && setExpanded(!expanded)}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "3px 6px", borderRadius: 4,
          backgroundColor: "#161b2240",
          cursor: tc.output ? "pointer" : "default",
          fontSize: 11, color: statusColor,
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        <ToolOutlined style={{ fontSize: 10 }} />
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {tc.name || "tool"}
        </span>
        {tc.output && <span style={{ fontSize: 9, color: "#484f58" }}>{expanded ? "▾" : "▸"}</span>}
      </div>
      {expanded && tc.output && (
        <pre style={{
          fontSize: 10, color: "#8b949e", lineHeight: 1.4,
          padding: "4px 6px", margin: "2px 0 0 0",
          maxHeight: 150, overflowY: "auto",
          backgroundColor: "#0d111733", borderRadius: 4,
          whiteSpace: "pre-wrap", wordBreak: "break-all",
        }}>
          {tc.output.length > 2000 ? tc.output.slice(0, 2000) + "..." : tc.output}
        </pre>
      )}
    </div>
  );
}

function AgentMiniSession({ agent, isWinner, isExpanded, onToggle }) {
  const statusCfg = STATUS_CONFIG[agent.status] || STATUS_CONFIG.running;
  const scrollRef = useRef(null);

  useEffect(() => {
    if (isExpanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [isExpanded, agent.thinkingContent, agent.toolCalls?.length]);

  return (
    <div style={{
      borderBottom: "1px solid #21262d",
      backgroundColor: isExpanded ? "#0d111780" : "transparent",
    }}>
      <div
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 10px",
          cursor: "pointer",
          transition: "background-color 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#161b2266"; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
      >
        <RobotOutlined style={{ color: "#bc8cff", fontSize: 11, flexShrink: 0 }} />
        <span style={{
          fontSize: 10, color: "#58a6ff",
          fontFamily: "'JetBrains Mono', monospace",
          padding: "1px 5px", borderRadius: 4,
          backgroundColor: "#1f6feb18", border: "1px solid #1f6feb30",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          maxWidth: 120, flexShrink: 1,
        }}>
          {agent.model || agent.agentId}
        </span>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 2,
          fontSize: 9, color: statusCfg.color,
          padding: "1px 5px", borderRadius: 6,
          backgroundColor: `${statusCfg.color}12`,
          flexShrink: 0,
        }}>
          {statusCfg.icon}
          {statusCfg.label}
        </span>
        {isWinner && (
          <TrophyOutlined style={{ fontSize: 10, color: "#f0c000", flexShrink: 0 }} />
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: "#484f58" }}>
          {isExpanded ? "▾" : "▸"}
        </span>
      </div>

      {isExpanded && (
        <div
          ref={scrollRef}
          style={{
            padding: "4px 10px 10px",
            maxHeight: "50vh",
            overflowY: "auto",
          }}
        >
          {agent.thinkingContent && (
            <div style={{ marginBottom: 6 }}>
              <div style={{
                fontSize: 9, color: "#484f58", marginBottom: 2,
                fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: "0.05em",
              }}>
                THINKING
              </div>
              <div style={{ fontSize: 11, color: "#8b949e", lineHeight: 1.5 }}>
                <ReactMarkdown>{agent.thinkingContent.slice(-3000)}</ReactMarkdown>
              </div>
            </div>
          )}

          {agent.toolCalls?.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <div style={{
                fontSize: 9, color: "#484f58", marginBottom: 2,
                fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: "0.05em",
              }}>
                TOOLS ({agent.toolCalls.length})
              </div>
              {agent.toolCalls.map((tc, i) => (
                <ToolCallEntry key={i} tc={tc} />
              ))}
            </div>
          )}

          {agent.result && (
            <div>
              <div style={{
                fontSize: 9, color: "#7ee787", marginBottom: 2,
                fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: "0.05em",
              }}>
                RESULT
              </div>
              <div style={{ fontSize: 11, color: "#c9d1d9", lineHeight: 1.5 }}>
                <ReactMarkdown>{agent.result}</ReactMarkdown>
              </div>
            </div>
          )}

          {!agent.thinkingContent && !agent.result && agent.status === "running" && (
            <div style={{ padding: "8px 0", color: "#484f58", fontSize: 11 }}>
              <LoadingOutlined spin /> Starting...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SwarmSidebar({ sessionId }) {
  const swarms = useAgentStreamStore(
    (state) => state.sessions[sessionId]?.swarms || EMPTY_SWARMS,
  );
  const sidebarExpanded = useAgentStreamStore((state) => state.sessions[sessionId]?.sidebarExpanded ?? true);
  const setSidebarExpanded = useAgentStreamStore((state) => state.setSidebarExpanded);
  const [expandedAgent, setExpandedAgent] = useState(null);

  const allAgents = swarms.flatMap((sw) =>
    (sw.agents || []).map((a) => ({ ...a, swarmId: sw.swarmId, winner: sw.winner })),
  );

  const activeCount = allAgents.filter((a) => a.status === "running").length;
  const hasAgents = allAgents.length > 0;

  if (!hasAgents) return null;

  if (!sidebarExpanded) {
    return (
      <div style={{
        width: 36,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 10,
        borderRight: "1px solid #21262d",
        backgroundColor: "#010409",
      }}>
        <div
          onClick={() => setSidebarExpanded(sessionId, true)}
          style={{
            cursor: "pointer", padding: 6,
            borderRadius: 6, backgroundColor: "#161b22",
            border: "1px solid #30363d",
          }}
          title="Expand racer sidebar"
        >
          <DoubleRightOutlined style={{ fontSize: 10, color: "#8b949e" }} />
        </div>

        <div style={{
          marginTop: 8, display: "flex", flexDirection: "column",
          gap: 4, alignItems: "center",
        }}>
          {allAgents.map((a) => {
            const cfg = STATUS_CONFIG[a.status] || STATUS_CONFIG.running;
            return (
              <div
                key={a.agentId}
                title={`${a.model || a.agentId}: ${cfg.label}`}
                style={{
                  width: 8, height: 8, borderRadius: "50%",
                  backgroundColor: cfg.color,
                  opacity: 0.8,
                }}
              />
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      width: 280,
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      borderRight: "1px solid #21262d",
      backgroundColor: "#010409",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "10px 12px",
        borderBottom: "1px solid #21262d",
        flexShrink: 0,
      }}>
        <ThunderboltFilled style={{ color: "#f0c000", fontSize: 12 }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--primary-text, #e6edf3)" }}>
          Racers
        </span>
        <span style={{
          fontSize: 9, color: "#484f58",
          padding: "1px 5px", borderRadius: 6,
          border: "1px solid #21262d",
        }}>
          {activeCount > 0
            ? `${activeCount}/${allAgents.length} active`
            : `${allAgents.length} done`}
        </span>
        <span style={{ flex: 1 }} />
        <div
          onClick={() => setSidebarExpanded(sessionId, false)}
          style={{ cursor: "pointer", padding: 2 }}
          title="Collapse sidebar"
        >
          <DoubleLeftOutlined style={{ fontSize: 10, color: "#484f58" }} />
        </div>
      </div>

      {/* Agent list */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        minHeight: 0,
      }}>
        {allAgents.map((agent) => (
          <AgentMiniSession
            key={agent.agentId}
            agent={agent}
            isWinner={agent.winner === agent.agentId}
            isExpanded={expandedAgent === agent.agentId}
            onToggle={() => setExpandedAgent(
              expandedAgent === agent.agentId ? null : agent.agentId,
            )}
          />
        ))}
      </div>

      {/* Findings summary */}
      {swarms.some((sw) => sw.findings?.length > 0) && (
        <div style={{
          borderTop: "1px solid #21262d",
          padding: "8px 10px",
          maxHeight: 120,
          overflowY: "auto",
          flexShrink: 0,
        }}>
          <div style={{
            fontSize: 9, color: "#f0c000", marginBottom: 4,
            fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
          }}>
            <BulbOutlined /> FINDINGS
          </div>
          {swarms.flatMap((sw) => sw.findings || []).slice(-5).map((f, i) => (
            <div key={i} style={{
              fontSize: 10, color: f.isSuccess ? "#7ee787" : "#8b949e",
              lineHeight: 1.4, marginBottom: 2,
              overflow: "hidden", textOverflow: "ellipsis",
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            }}>
              <span style={{ color: "#484f58" }}>[{f.agentId}]</span> {f.finding}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
