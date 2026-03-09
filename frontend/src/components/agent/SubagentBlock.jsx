"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  BranchesOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import ReactMarkdown from "react-markdown";

const STATUS_CONFIG = {
  running: { icon: <LoadingOutlined spin />, color: "#58a6ff", label: "Running" },
  completed: { icon: <CheckCircleOutlined />, color: "#7ee787", label: "Completed" },
  failed: { icon: <CloseCircleOutlined />, color: "#f85149", label: "Failed" },
  cancelled: { icon: <CloseCircleOutlined />, color: "#d29922", label: "Cancelled" },
};

function SubagentModal({ message, onClose }) {
  const status = message.status || "running";
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.running;

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
          width: "min(720px, 90vw)",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: 12,
          border: "1px solid #30363d",
          backgroundColor: "#0d1117",
          overflow: "hidden",
        }}
      >
        {/* Modal header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 18px",
          borderBottom: "1px solid #21262d",
          flexShrink: 0,
        }}>
          <BranchesOutlined style={{ color: "#bc8cff", fontSize: 15 }} />
          <span style={{ fontSize: 12, color: "#8b949e", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
            SUBAGENT
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
          <span style={{ flex: 1 }} />
          <CloseOutlined
            onClick={onClose}
            style={{ fontSize: 14, color: "#484f58", cursor: "pointer" }}
          />
        </div>

        {/* Task */}
        <div style={{
          padding: "12px 18px",
          fontSize: 13,
          color: "#c9d1d9",
          lineHeight: 1.6,
          borderBottom: "1px solid #21262d",
          flexShrink: 0,
          fontWeight: 500,
        }}>
          {message.task}
        </div>

        {/* Scrollable content */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          minHeight: 0,
        }}>
          {/* Thinking / thread */}
          {message.content && (
            <div style={{
              padding: "14px 18px",
              borderBottom: "1px solid #21262d",
            }}>
              <div style={{ fontSize: 10, color: "#484f58", marginBottom: 8, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: "0.05em" }}>
                AGENT THINKING
              </div>
              <div style={{ fontSize: 13, color: "#8b949e", lineHeight: 1.7 }}>
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* Result */}
          {message.result && (
            <div style={{
              padding: "14px 18px",
              borderBottom: "1px solid #21262d",
            }}>
              <div style={{ fontSize: 10, color: "#7ee787", marginBottom: 8, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: "0.05em" }}>
                RESULT
              </div>
              <div style={{ fontSize: 13, color: "#c9d1d9", lineHeight: 1.7 }}>
                <ReactMarkdown>{message.result}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* Error */}
          {message.error && (
            <div style={{ padding: "14px 18px" }}>
              <div style={{ fontSize: 10, color: "#f85149", marginBottom: 8, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: "0.05em" }}>
                ERROR
              </div>
              <div style={{ fontSize: 13, color: "#f85149", lineHeight: 1.6 }}>
                {message.error}
              </div>
            </div>
          )}

          {/* Empty state for running */}
          {!message.content && !message.result && !message.error && status === "running" && (
            <div style={{
              padding: "40px 18px",
              textAlign: "center",
              color: "#484f58",
              fontSize: 13,
            }}>
              Subagent is working...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SubagentBlock({ message }) {
  const status = message.status || "running";
  const [modalOpen, setModalOpen] = useState(false);
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.running;

  const taskPreview = message.task
    ? message.task.length > 80
      ? message.task.slice(0, 78) + "..."
      : message.task
    : "Subagent task";

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
          border: `1px solid ${status === "running" ? "#1f6feb33" : "#30363d"}`,
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
          e.currentTarget.style.borderColor = status === "running" ? "#1f6feb33" : "#30363d";
          e.currentTarget.style.backgroundColor = "#161b22";
        }}
      >
        <BranchesOutlined style={{ color: "#bc8cff", fontSize: 12, flexShrink: 0 }} />
        <span style={{
          fontSize: 11,
          color: "#8b949e",
          fontFamily: "'JetBrains Mono', monospace",
          flexShrink: 0,
        }}>
          SUBAGENT
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
          flex: 1,
          fontSize: 12,
          color: "#6e7681",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          marginLeft: 4,
        }}>
          {taskPreview}
        </span>
      </div>
      {modalOpen && (
        <SubagentModal
          message={message}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
