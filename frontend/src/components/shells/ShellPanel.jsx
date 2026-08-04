"use client";

import React, { useState, useCallback } from "react";
import { ApiOutlined, DisconnectOutlined, ReloadOutlined } from "@ant-design/icons";
import ShellTabBar from "./ShellTabBar";
import ShellTerminal from "./ShellTerminal";

export default function ShellPanel({
  shells,
  subscribeShell,
  unsubscribeShell,
  sendShellInput,
  onShellOutput,
  spawnShell,
  closeShell,
  resizeShell,
  connectionStatus,
  wsConnected,
  onReconnectHost,
}) {
  const [activeShellId, setActiveShellId] = useState(null);
  const [reconnecting, setReconnecting] = useState(false);
  const activeShells = shells.filter((s) => s.status === "active");
  const hostOk = connectionStatus?.hostConnected ?? connectionStatus?.sshConnected ?? false;

  const currentShellId = activeShellId && activeShells.find((s) => s.shellId === activeShellId)
    ? activeShellId
    : activeShells[0]?.shellId ?? null;

  const handleSpawnShell = useCallback(() => {
    const label = `shell-${shells.length + 1}`;
    spawnShell(label);
  }, [shells.length, spawnShell]);

  const handleCloseShell = useCallback((shellId) => {
    closeShell(shellId);
    if (activeShellId === shellId) {
      const remaining = activeShells.filter((s) => s.shellId !== shellId);
      setActiveShellId(remaining[0]?.shellId ?? null);
    }
  }, [activeShellId, activeShells, closeShell]);

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
      flexDirection: "column",
      height: "100%",
      backgroundColor: "#111111",
      borderLeft: "1px solid rgba(255, 255, 255, 0.06)",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "5px 12px",
        backgroundColor: "#0a0a0a",
        borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        fontSize: 11,
        fontFamily: "'JetBrains Mono', monospace",
        color: "#a1a1a1",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {hostOk ? (
            <ApiOutlined style={{ color: "#10ca00", fontSize: 12 }} />
          ) : (
            <DisconnectOutlined style={{ color: "#ff3e3e", fontSize: 12 }} />
          )}
          <span style={{ color: hostOk ? "#10ca00" : "#ff3e3e" }}>
            Host {hostOk ? "Connected" : "Disconnected"}
          </span>
          {!hostOk && onReconnectHost && (
            <button
              onClick={handleReconnect}
              disabled={reconnecting}
              style={{
                background: "none",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 4,
                color: reconnecting ? "#6d6d6d" : "#8e35ff",
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
          backgroundColor: "rgba(255, 255, 255, 0.08)",
        }} />

        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            backgroundColor: wsConnected ? "#10ca00" : "#ff3e3e",
          }} />
          <span>WS {wsConnected ? "Connected" : "Disconnected"}</span>
        </div>

        {connectionStatus?.lastError && !hostOk && (
          <>
            <div style={{
              width: 1,
              height: 12,
              backgroundColor: "rgba(255, 255, 255, 0.08)",
            }} />
            <span style={{ color: "#ff3e3e" }}>
              {connectionStatus.lastError}
            </span>
          </>
        )}
      </div>

      <ShellTabBar
        shells={shells}
        activeShellId={currentShellId}
        onSelectShell={setActiveShellId}
        onSpawnShell={handleSpawnShell}
        onCloseShell={handleCloseShell}
      />

      <div style={{ flex: 1, position: "relative" }}>
        {currentShellId ? (
          <ShellTerminal
            key={currentShellId}
            shellId={currentShellId}
            subscribeShell={subscribeShell}
            unsubscribeShell={unsubscribeShell}
            sendShellInput={sendShellInput}
            onShellOutput={onShellOutput}
            resizeShell={resizeShell}
          />
        ) : (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "#6d6d6d",
            fontSize: 14,
            fontFamily: "'JetBrains Mono', monospace",
            flexDirection: "column",
            gap: 12,
          }}>
            <p>No active shells</p>
            <button
              onClick={handleSpawnShell}
              style={{
                padding: "6px 16px",
                borderRadius: 6,
                border: "1px solid rgba(255, 255, 255, 0.1)",
                backgroundColor: "rgba(142, 53, 255, 0.1)",
                color: "#ffffff",
                cursor: "pointer",
                fontSize: 13,
                transition: "all 150ms ease",
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(142, 53, 255, 0.2)"}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "rgba(142, 53, 255, 0.1)"}
            >
              Spawn Shell
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
