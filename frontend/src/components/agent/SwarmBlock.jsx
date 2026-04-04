"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ClusterOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  CloseOutlined,
  TrophyOutlined,
  BulbOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import ReactMarkdown from "react-markdown";
import { useAgentStreamStore } from "@/store/agentStream.store";

const STATUS_CONFIG = {
  running: { icon: <LoadingOutlined spin />, color: "#58a6ff", label: "Running" },
  completed: { icon: <CheckCircleOutlined />, color: "#7ee787", label: "Completed" },
  failed: { icon: <CloseCircleOutlined />, color: "#f85149", label: "Failed" },
  cancelled: { icon: <CloseCircleOutlined />, color: "#d29922", label: "Cancelled" },
  timed_out: { icon: <CloseCircleOutlined />, color: "#d29922", label: "Timed Out" },
};

const WIN_CONDITION_LABELS = {
  first_success: "First to succeed wins",
  all_complete: "Wait for all agents",
};

function SwarmAgentRow({ agent, isWinner }) {
  const [expanded, setExpanded] = useState(false);
  const statusCfg = STATUS_CONFIG[agent.status] || STATUS_CONFIG.running;

  return (
    <div style={{
      borderBottom: "1px solid #21262d",
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 18px",
          cursor: "pointer",
          transition: "background-color 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#161b2266"; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
      >
        <RobotOutlined style={{ color: "#bc8cff", fontSize: 13, flexShrink: 0 }} />
        <span style={{
          fontSize: 11,
          color: "#58a6ff",
          fontFamily: "'JetBrains Mono', monospace",
          padding: "1px 6px",
          borderRadius: 6,
          backgroundColor: "#1f6feb20",
          border: "1px solid #1f6feb40",
          flexShrink: 0,
        }}>
          {agent.model || agent.agentId}
        </span>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          fontSize: 10,
          color: statusCfg.color,
          padding: "1px 6px",
          borderRadius: 8,
          backgroundColor: `${statusCfg.color}15`,
          border: `1px solid ${statusCfg.color}30`,
          flexShrink: 0,
        }}>
          {statusCfg.icon}
          {statusCfg.label}
        </span>
        {isWinner && (
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            fontSize: 10,
            color: "#f0c000",
            padding: "1px 6px",
            borderRadius: 8,
            backgroundColor: "#f0c00015",
            border: "1px solid #f0c00030",
            flexShrink: 0,
          }}>
            <TrophyOutlined />
            Winner
          </span>
        )}
        <span style={{
          flex: 1,
          fontSize: 12,
          color: "#6e7681",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          marginLeft: 4,
        }}>
          {agent.task ? (agent.task.length > 60 ? agent.task.slice(0, 58) + "..." : agent.task) : ""}
        </span>
        <span style={{ fontSize: 11, color: "#484f58", flexShrink: 0 }}>
          {expanded ? "▾" : "▸"}
        </span>
      </div>
      {expanded && (
        <div style={{ padding: "0 18px 12px", borderTop: "1px solid #161b22" }}>
          {agent.thinkingContent && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, color: "#484f58", marginBottom: 4, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: "0.05em" }}>
                THINKING
              </div>
              <div style={{ fontSize: 12, color: "#8b949e", lineHeight: 1.6, maxHeight: 200, overflowY: "auto" }}>
                <ReactMarkdown>{agent.thinkingContent.slice(-2000)}</ReactMarkdown>
              </div>
            </div>
          )}
          {agent.result && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, color: "#7ee787", marginBottom: 4, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: "0.05em" }}>
                RESULT
              </div>
              <div style={{ fontSize: 12, color: "#c9d1d9", lineHeight: 1.6, maxHeight: 300, overflowY: "auto" }}>
                <ReactMarkdown>{agent.result}</ReactMarkdown>
              </div>
            </div>
          )}
          {!agent.thinkingContent && !agent.result && agent.status === "running" && (
            <div style={{ padding: "12px 0", color: "#484f58", fontSize: 12 }}>
              Agent is working...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SwarmModal({ message, swarmData, onClose }) {
  const status = message.status || "running";
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.running;
  const winLabel = WIN_CONDITION_LABELS[message.winCondition] || message.winCondition;
  const agents = swarmData?.agents || message.agents || [];
  const findings = swarmData?.findings || [];

  const handleEscape = useCallback((e) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [handleEscape]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(820px, 92vw)",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: 12,
          border: "1px solid #30363d",
          backgroundColor: "#0d1117",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 18px",
          borderBottom: "1px solid #21262d",
          flexShrink: 0,
        }}>
          <ClusterOutlined style={{ color: "#f0c000", fontSize: 15 }} />
          <span style={{ fontSize: 12, color: "#8b949e", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
            SWARM
          </span>
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            color: config.color,
            padding: "2px 10px",
            borderRadius: 10,
            backgroundColor: `${config.color}15`,
            border: `1px solid ${config.color}30`,
          }}>
            {config.icon}
            {config.label}
          </span>
          <span style={{
            fontSize: 10,
            color: "#484f58",
            padding: "2px 8px",
            borderRadius: 8,
            border: "1px solid #21262d",
          }}>
            {winLabel}
          </span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: "#484f58" }}>
            {agents.length} agent{agents.length !== 1 ? "s" : ""}
          </span>
          <CloseOutlined
            onClick={onClose}
            style={{ fontSize: 14, color: "#484f58", cursor: "pointer" }}
          />
        </div>

        {/* Goal */}
        <div style={{
          padding: "12px 18px",
          fontSize: 13,
          color: "#c9d1d9",
          lineHeight: 1.6,
          borderBottom: "1px solid #21262d",
          flexShrink: 0,
          fontWeight: 500,
        }}>
          {message.goal}
        </div>

        {/* Scrollable content */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          minHeight: 0,
        }}>
          {/* Agent rows */}
          {agents.map((agent) => (
            <SwarmAgentRow
              key={agent.agentId}
              agent={agent}
              isWinner={message.winner === agent.agentId || swarmData?.winner === agent.agentId}
            />
          ))}

          {/* Findings */}
          {findings.length > 0 && (
            <div style={{ padding: "12px 18px", borderTop: "1px solid #21262d" }}>
              <div style={{ fontSize: 10, color: "#f0c000", marginBottom: 8, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: "0.05em" }}>
                SHARED FINDINGS ({findings.length})
              </div>
              {findings.map((f, i) => (
                <div key={i} style={{
                  display: "flex",
                  gap: 8,
                  padding: "6px 0",
                  borderTop: i > 0 ? "1px solid #161b22" : "none",
                }}>
                  <BulbOutlined style={{ color: f.isSuccess ? "#7ee787" : "#58a6ff", flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <span style={{ fontSize: 10, color: "#484f58", fontFamily: "'JetBrains Mono', monospace" }}>
                      {f.agentId}
                    </span>
                    {f.isSuccess && (
                      <span style={{ fontSize: 10, color: "#7ee787", marginLeft: 6 }}>SUCCESS</span>
                    )}
                    <div style={{ fontSize: 12, color: "#8b949e", lineHeight: 1.5, marginTop: 2 }}>
                      {f.finding}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Result summary */}
          {message.result && (
            <div style={{ padding: "14px 18px", borderTop: "1px solid #21262d" }}>
              <div style={{ fontSize: 10, color: "#7ee787", marginBottom: 8, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: "0.05em" }}>
                SUMMARY
              </div>
              <div style={{ fontSize: 13, color: "#c9d1d9", lineHeight: 1.7 }}>
                <ReactMarkdown>{message.result}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SwarmBlock({ message, sessionId }) {
  const status = message.status || "running";
  const [modalOpen, setModalOpen] = useState(false);
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.running;

  const swarmData = useAgentStreamStore((state) => {
    const s = state.sessions[sessionId];
    return s?.swarms?.find((sw) => sw.swarmId === message.swarmId) || null;
  });

  const agents = swarmData?.agents || message.agents || [];
  const agentCount = agents.length;
  const runningCount = agents.filter((a) => a.status === "running").length;

  return (
    <>
      <div
        onClick={() => setModalOpen(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          margin: "4px 0",
          padding: "7px 12px",
          borderRadius: 6,
          border: `1px solid ${status === "running" ? "#f0c00033" : "#30363d"}`,
          backgroundColor: "#161b22",
          cursor: "pointer",
          transition: "border-color 0.15s, background-color 0.15s",
          userSelect: "none",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "#484f58";
          e.currentTarget.style.backgroundColor = "#1c2128";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = status === "running" ? "#f0c00033" : "#30363d";
          e.currentTarget.style.backgroundColor = "#161b22";
        }}
      >
        <ClusterOutlined style={{ color: "#f0c000", fontSize: 12, flexShrink: 0 }} />
        <span style={{
          fontSize: 11,
          color: "#8b949e",
          fontFamily: "'JetBrains Mono', monospace",
          flexShrink: 0,
        }}>
          SWARM
        </span>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          fontSize: 10,
          color: config.color,
          padding: "1px 6px",
          borderRadius: 8,
          backgroundColor: `${config.color}15`,
          border: `1px solid ${config.color}30`,
          flexShrink: 0,
        }}>
          {config.icon}
          {config.label}
        </span>
        <span style={{
          fontSize: 10,
          color: "#484f58",
          flexShrink: 0,
        }}>
          {status === "running" ? `${runningCount}/${agentCount} active` : `${agentCount} agents`}
        </span>
        {message.winner && (
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            fontSize: 10,
            color: "#f0c000",
            flexShrink: 0,
          }}>
            <TrophyOutlined />
          </span>
        )}
        <span style={{
          flex: 1,
          fontSize: 12,
          color: "#6e7681",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          marginLeft: 4,
        }}>
          {message.goal ? (message.goal.length > 60 ? message.goal.slice(0, 58) + "..." : message.goal) : "Swarm task"}
        </span>
      </div>
      {modalOpen && (
        <SwarmModal
          message={message}
          swarmData={swarmData}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
