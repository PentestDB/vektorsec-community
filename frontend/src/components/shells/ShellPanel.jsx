"use client";

import React, { useState, useCallback } from "react";
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
  connectionStatus,
}) {
  const [activeShellId, setActiveShellId] = useState(null);
  const activeShells = shells.filter((s) => s.status === "active");

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

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      backgroundColor: "#0d1117",
      borderLeft: "1px solid #21262d",
    }}>
      {/* Connection status bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        backgroundColor: "#161b22",
        borderBottom: "1px solid #30363d",
        fontSize: 11,
        color: "#8b949e",
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        <span style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor: connectionStatus.sshConnected ? "#7ee787" : "#f85149",
        }} />
        <span>SSH {connectionStatus.sshConnected ? "Connected" : "Disconnected"}</span>
        {connectionStatus.error && !connectionStatus.sshConnected && (
          <span style={{ color: "#f85149", marginLeft: 4 }}>({connectionStatus.error})</span>
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
          />
        ) : (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "#484f58",
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
                border: "1px solid #30363d",
                backgroundColor: "#21262d",
                color: "#c9d1d9",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Spawn Shell
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
