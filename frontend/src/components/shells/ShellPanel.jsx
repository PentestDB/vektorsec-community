"use client";

import React, { useState, useCallback, useRef } from "react";
import { App } from "antd";
import { useRouter } from "next/navigation";
import {
  ApiOutlined,
  CloudServerOutlined,
  DisconnectOutlined,
  LaptopOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { FiTerminal } from "react-icons/fi";
import ShellTabBar from "./ShellTabBar";
import ShellTerminal from "./ShellTerminal";

export default function ShellPanel({
  sessionId,
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
  const { message } = App.useApp();
  const router = useRouter();
  const [activeShellId, setActiveShellId] = useState(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const warnedLocalHost = useRef(false);
  const activeShells = shells.filter((s) => s.status === "active");
  const hostOk = connectionStatus?.hostConnected ?? connectionStatus?.sshConnected ?? false;
  // Which machine the terminals actually run on. `kind` arrives from the backend
  // (session connection_state / WS connection_status); undefined means the work
  // host has not been resolved yet (nothing has connected in this session).
  const hostKind = connectionStatus?.kind ?? connectionStatus?.hostKind;
  const isLocalHost = hostKind === "local";
  const hostLabel = connectionStatus?.hostLabel || connectionStatus?.sshProfileAlias || "";
  const connectionHref = sessionId ? `/session/${sessionId}/connection` : null;

  const openConnectionSettings = useCallback(() => {
    if (connectionHref) router.push(connectionHref);
  }, [connectionHref, router]);

  const currentShellId = activeShellId && activeShells.find((s) => s.shellId === activeShellId)
    ? activeShellId
    : activeShells[0]?.shellId ?? null;

  const handleSpawnShell = useCallback(() => {
    const label = `shell-${shells.length + 1}`;
    const sent = spawnShell(label);
    if (!sent) {
      message.error("Could not open a shell — the connection is offline. Try again in a moment.");
    }
  }, [shells.length, spawnShell, message]);

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

  // "SSH Connect" — establish the work-host connection (if not connected) and
  // immediately open a fresh terminal on it. Spawning a shell over the WS
  // auto-connects the host too, so this is safe even when hostOk is false.
  const handleSshConnect = useCallback(async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      // If the shell WebSocket is down, spawnShell would silently drop the
      // message — always surface that instead of doing nothing.
      if (!wsConnected) {
        message.error("Shell connection is offline — reconnecting. Try again in a moment.");
        return;
      }
      if (!hostOk && onReconnectHost) {
        const ok = await onReconnectHost();
        if (ok === false) {
          // The reconnect already surfaced its own error notification.
          return;
        }
      }
      if (isLocalHost && !warnedLocalHost.current) {
        // Say it once per panel: this terminal is the Pentest Copilot container,
        // not the exploit box the user configured under Settings → SSH.
        warnedLocalHost.current = true;
        message.warning(
          "This session runs on the local host (the Pentest Copilot container). To work on your own box, pick an SSH host in the Connection tab.",
          6,
        );
      }
      const sent = spawnShell(`ssh-${shells.length + 1}`);
      if (!sent) {
        message.error("Could not open a shell — the connection was lost. Click Reconnect and try again.");
      }
    } catch (err) {
      message.error(err?.message || "SSH Connect failed");
    } finally {
      setTimeout(() => setConnecting(false), 1200);
    }
  }, [connecting, hostOk, isLocalHost, onReconnectHost, shells.length, spawnShell, wsConnected, message]);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      backgroundColor: "#0d1117",
      borderLeft: "1px solid rgba(0, 242, 254, 0.12)",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "5px 12px",
        backgroundColor: "#0d1117",
        borderBottom: "1px solid rgba(0, 242, 254, 0.12)",
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
                border: "1px solid rgba(0, 242, 254, 0.35)",
                borderRadius: 4,
                color: reconnecting ? "#6d6d6d" : "#00f2fe",
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
          backgroundColor: "rgba(0, 242, 254, 0.15)",
        }} />

        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            backgroundColor: wsConnected ? "#00e676" : "#ff3e3e",
          }} />
          <span>WS {wsConnected ? "Connected" : "Disconnected"}</span>
        </div>

        <div style={{
          width: 1,
          height: 12,
          backgroundColor: "rgba(0, 242, 254, 0.15)",
        }} />

        {/* Where do the terminals actually run? SSH box vs the backend container. */}
        <div
          style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}
          title={
            hostKind === "ssh"
              ? `Commands run on the SSH host${hostLabel ? ` "${hostLabel}"` : ""}`
              : isLocalHost
                ? "Commands run inside the Pentest Copilot container — not on your own box"
                : "Work host not resolved yet — connect a shell to see where it runs"
          }
        >
          {hostKind === "ssh" ? (
            <CloudServerOutlined style={{ color: "#00f2fe", fontSize: 11 }} />
          ) : (
            <LaptopOutlined style={{ color: isLocalHost ? "#ffb300" : "#6d6d6d", fontSize: 11 }} />
          )}
          <span style={{
            color: hostKind === "ssh" ? "#00f2fe" : isLocalHost ? "#ffb300" : "#6d6d6d",
            maxWidth: 170,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {hostKind === "ssh"
              ? `SSH · ${hostLabel || "remote host"}`
              : isLocalHost
                ? "Local · container"
                : "Host · unknown"}
          </span>
          {isLocalHost && connectionHref && (
            <button
              onClick={openConnectionSettings}
              title="Open the Connection tab and select an SSH host for this workspace"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                background: "none",
                border: "1px solid rgba(255, 179, 0, 0.45)",
                borderRadius: 4,
                color: "#ffb300",
                cursor: "pointer",
                padding: "1px 6px",
                fontSize: 10,
                whiteSpace: "nowrap",
              }}
            >
              <CloudServerOutlined style={{ fontSize: 9 }} />
              Use SSH host
            </button>
          )}
        </div>

        <div style={{
          width: 1,
          height: 12,
          backgroundColor: "rgba(0, 242, 254, 0.15)",
        }} />

        <button
          onClick={handleSshConnect}
          disabled={connecting}
          title={
            isLocalHost
              ? "Opens a terminal in the local Pentest Copilot container — pick an SSH host in the Connection tab to work on your own box"
              : hostOk
                ? "Open a new SSH terminal"
                : "Connect SSH and open a terminal"
          }
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            background: hostOk
              ? "linear-gradient(135deg, #00f2fe, #00d2ff)"
              : "rgba(0, 242, 254, 0.08)",
            border: `1px solid ${hostOk ? "transparent" : "rgba(0, 242, 254, 0.45)"}`,
            borderRadius: 4,
            color: hostOk ? "#000000" : "#00f2fe",
            cursor: connecting ? "not-allowed" : "pointer",
            padding: "2px 8px",
            fontSize: 10,
            fontWeight: 600,
            boxShadow: hostOk ? "0 0 10px rgba(0, 242, 254, 0.3)" : "none",
            transition: "all 150ms ease",
          }}
          onMouseEnter={(e) => {
            if (connecting) return;
            e.currentTarget.style.background = hostOk
              ? "linear-gradient(135deg, #00d2ff, #00b8d9)"
              : "rgba(0, 242, 254, 0.2)";
            e.currentTarget.style.boxShadow = "0 0 14px rgba(0, 242, 254, 0.45)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = hostOk
              ? "linear-gradient(135deg, #00f2fe, #00d2ff)"
              : "rgba(0, 242, 254, 0.08)";
            e.currentTarget.style.boxShadow = hostOk ? "0 0 10px rgba(0, 242, 254, 0.3)" : "none";
          }}
        >
          <FiTerminal style={{ fontSize: 11 }} />
          {connecting ? "Connecting..." : isLocalHost ? "Local Shell" : "SSH Connect"}
        </button>

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
            position: "relative",
          }}>
            <FiTerminal
              style={{
                position: "absolute",
                fontSize: 150,
                color: "rgba(0, 242, 254, 0.05)",
              }}
            />
            <p style={{ position: "relative", margin: 0 }}>No active shells</p>
            <button
              onClick={handleSpawnShell}
              style={{
                position: "relative",
                padding: "7px 18px",
                borderRadius: 6,
                border: "1px solid #00f2fe",
                background: "linear-gradient(135deg, #00f2fe, #00d2ff)",
                color: "#000000",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                boxShadow: "0 0 12px rgba(0, 242, 254, 0.35)",
                transition: "all 150ms ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "linear-gradient(135deg, #00d2ff, #00b8d9)";
                e.currentTarget.style.boxShadow = "0 0 22px rgba(0, 242, 254, 0.6)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "linear-gradient(135deg, #00f2fe, #00d2ff)";
                e.currentTarget.style.boxShadow = "0 0 12px rgba(0, 242, 254, 0.35)";
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
