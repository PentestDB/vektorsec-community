"use client";

import React, { useState } from "react";
import { PlusOutlined, CloseOutlined, DownOutlined, UpOutlined } from "@ant-design/icons";

const CREATOR_COLOR = {
  user: "#00f2fe",
  agent: "#00e676",
  subagent: "#00d2ff",
};

function ShellPill({ shell, isActive, onSelect, onClose }) {
  const isClosed = shell.status === "closed";
  const dotColor = isClosed ? "#6d6d6d" : (CREATOR_COLOR[shell.createdBy] ?? "#a1a1a1");
  const label = shell.label || shell.shellId;
  const shortLabel = label.length > 18 ? label.slice(0, 16) + "…" : label;

  return (
    <div
      onClick={() => !isClosed && onSelect(shell.shellId)}
      title={label}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontFamily: "'JetBrains Mono', monospace",
        cursor: isClosed ? "default" : "pointer",
        backgroundColor: isActive ? "rgba(0, 242, 254, 0.12)" : "transparent",
        color: isClosed ? "#6d6d6d" : isActive ? "#ffffff" : "#a1a1a1",
        border: isActive ? "1px solid rgba(0, 242, 254, 0.4)" : "1px solid transparent",
        opacity: isClosed ? 0.4 : 1,
        whiteSpace: "nowrap",
        textDecoration: isClosed ? "line-through" : "none",
        transition: "all 0.15s ease",
        lineHeight: 1.3,
      }}
    >
      <span style={{
        width: 5,
        height: 5,
        borderRadius: "50%",
        backgroundColor: dotColor,
        flexShrink: 0,
      }} />
      <span>{shortLabel}</span>
      {!isClosed && (
        <CloseOutlined
          style={{ fontSize: 8, color: "#6d6d6d" }}
          onClick={(e) => {
            e.stopPropagation();
            onClose(shell.shellId);
          }}
        />
      )}
    </div>
  );
}

export default function ShellTabBar({
  shells,
  activeShellId,
  onSelectShell,
  onSpawnShell,
  onCloseShell,
}) {
  const [showClosed, setShowClosed] = useState(false);

  const activeShells = shells.filter((s) => s.status === "active");
  const closedShells = shells.filter((s) => s.status === "closed");

  return (
    <div style={{
      backgroundColor: "#0d1117",
      borderBottom: "1px solid rgba(0, 242, 254, 0.12)",
      flexShrink: 0,
    }}>
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 2,
        padding: "4px 8px",
        maxHeight: 120,
        overflowY: "auto",
      }}>
        {activeShells.map((shell) => (
          <ShellPill
            key={shell.shellId}
            shell={shell}
            isActive={shell.shellId === activeShellId}
            onSelect={onSelectShell}
            onClose={onCloseShell}
          />
        ))}

        <div
          onClick={onSpawnShell}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 8px",
            borderRadius: 4,
            fontSize: 11,
            cursor: "pointer",
            color: "#a1a1a1",
            transition: "color 0.15s ease",
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = "#ffffff"}
          onMouseLeave={(e) => e.currentTarget.style.color = "#a1a1a1"}
        >
          <PlusOutlined style={{ fontSize: 9 }} />
          <span>New</span>
        </div>

        {closedShells.length > 0 && (
          <div
            onClick={() => setShowClosed(!showClosed)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              padding: "3px 6px",
              borderRadius: 4,
              fontSize: 10,
              cursor: "pointer",
              color: "#6d6d6d",
              marginLeft: "auto",
              transition: "color 0.15s ease",
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = "#a1a1a1"}
            onMouseLeave={(e) => e.currentTarget.style.color = "#6d6d6d"}
          >
            {showClosed ? <UpOutlined style={{ fontSize: 8 }} /> : <DownOutlined style={{ fontSize: 8 }} />}
            <span>{closedShells.length} closed</span>
          </div>
        )}
      </div>

      {showClosed && closedShells.length > 0 && (
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 2,
          padding: "2px 8px 4px",
          borderTop: "1px solid rgba(255, 255, 255, 0.06)",
        }}>
          {closedShells.map((shell) => (
            <ShellPill
              key={shell.shellId}
              shell={shell}
              isActive={false}
              onSelect={onSelectShell}
              onClose={onCloseShell}
            />
          ))}
        </div>
      )}
    </div>
  );
}
