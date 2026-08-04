"use client";

import React, { useState } from "react";
import { ApiOutlined, DisconnectOutlined, ReloadOutlined } from "@ant-design/icons";

export default function ConnectionStatusBar({ connectionStatus, wsConnected, onReconnectHost }) {
  const hostOk = connectionStatus?.hostConnected ?? connectionStatus?.sshConnected ?? false;
  const [reconnecting, setReconnecting] = useState(false);

  const handleReconnect = async () => {
    if (reconnecting || !onReconnectHost) return;
    setReconnecting(true);
    try {
      await onReconnectHost();
    } finally {
      setTimeout(() => setReconnecting(false), 2000);
    }
  };

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 14,
      padding: "4px 14px",
      backgroundColor: "#0d1117",
      borderBottom: "1px solid #21262d",
      fontSize: 11,
      fontFamily: "'JetBrains Mono', monospace",
      color: "#8b949e",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        {hostOk ? (
          <ApiOutlined style={{ color: "#7ee787", fontSize: 12 }} />
        ) : (
          <DisconnectOutlined style={{ color: "#f85149", fontSize: 12 }} />
        )}
        <span style={{ color: hostOk ? "#7ee787" : "#f85149" }}>
          Host {hostOk ? "Connected" : "Disconnected"}
        </span>
        {!hostOk && onReconnectHost && (
          <button
            onClick={handleReconnect}
            disabled={reconnecting}
            style={{
              background: "none",
              border: "1px solid #30363d",
              borderRadius: 4,
              color: reconnecting ? "#484f58" : "#58a6ff",
              cursor: reconnecting ? "not-allowed" : "pointer",
              padding: "1px 6px",
              fontSize: 10,
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              marginLeft: 2,
            }}
          >
            <ReloadOutlined spin={reconnecting} style={{ fontSize: 9 }} />
            {reconnecting ? "..." : "Reconnect"}
          </button>
        )}
      </div>

      <div style={{
        width: 1,
        height: 12,
        backgroundColor: "#21262d",
      }} />

      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          backgroundColor: wsConnected ? "#7ee787" : "#f85149",
        }} />
        <span>WS {wsConnected ? "Connected" : "Disconnected"}</span>
      </div>

      {connectionStatus?.lastError && !hostOk && (
        <>
          <div style={{
            width: 1,
            height: 12,
            backgroundColor: "#21262d",
          }} />
          <span style={{ color: "#f85149" }}>
            {connectionStatus.lastError}
          </span>
        </>
      )}
    </div>
  );
}
