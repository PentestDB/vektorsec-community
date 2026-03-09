"use client";

import React, { useState, useCallback } from "react";
import { notification } from "antd";
import ChatView from "./ChatView";
import ShellPanel from "@/components/shells/ShellPanel";
import useShellSocket from "@/hooks/useShellSocket";
import { reconnectSSH } from "@/services/agent.service";

const SessionMainPage = ({ session_id }) => {
  const [shellPanelWidth, setShellPanelWidth] = useState(45);
  const [isDragging, setIsDragging] = useState(false);

  const handleShellError = useCallback((message, severity = "error") => {
    notification[severity === "success" ? "success" : severity === "warning" ? "warning" : "error"]({
      message: severity === "success" ? "Connection" : "Shell Error",
      description: message,
      duration: severity === "success" ? 3 : 5,
      placement: "bottomRight",
    });
  }, []);

  const handleReconnectSSH = useCallback(async () => {
    try {
      await reconnectSSH(session_id);
      notification.success({
        message: "SSH Reconnect",
        description: "Reconnection initiated",
        duration: 3,
        placement: "bottomRight",
      });
    } catch (err) {
      notification.error({
        message: "SSH Reconnect Failed",
        description: err?.response?.data?.message ?? err.message ?? "Unknown error",
        duration: 5,
        placement: "bottomRight",
      });
    }
  }, [session_id]);

  const {
    shells,
    connectionStatus,
    wsConnected,
    subscribeShell,
    unsubscribeShell,
    sendShellInput,
    spawnShell,
    closeShell,
    onShellOutput,
  } = useShellSocket({ sessionId: session_id, onError: handleShellError });

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);

    const handleMouseMove = (e) => {
      const container = document.getElementById("session-split-container");
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const pct = ((rect.right - e.clientX) / rect.width) * 100;
      setShellPanelWidth(Math.max(20, Math.min(70, pct)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div
        id="session-split-container"
        style={{
          display: "flex",
          flex: 1,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Agent Chat Panel */}
        <div style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}>
          <ChatView sessionId={session_id} />
        </div>

        {/* Resize Handle */}
        <div
          onMouseDown={handleMouseDown}
          style={{
            width: 4,
            cursor: "col-resize",
            backgroundColor: isDragging ? "#8e35ff" : "rgba(255, 255, 255, 0.06)",
            transition: isDragging ? "none" : "background-color 0.15s ease",
            flexShrink: 0,
            zIndex: 10,
          }}
          onMouseEnter={(e) => { if (!isDragging) e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.12)"; }}
          onMouseLeave={(e) => { if (!isDragging) e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.06)"; }}
        />

        {/* Shell Panel */}
        <div style={{
          width: `${shellPanelWidth}%`,
          minWidth: 250,
          overflow: "hidden",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
        }}>
          <ShellPanel
            shells={shells}
            subscribeShell={subscribeShell}
            unsubscribeShell={unsubscribeShell}
            sendShellInput={sendShellInput}
            onShellOutput={onShellOutput}
            spawnShell={spawnShell}
            closeShell={closeShell}
            connectionStatus={connectionStatus}
            wsConnected={wsConnected}
            onReconnectSSH={handleReconnectSSH}
          />
        </div>
      </div>
    </div>
  );
};

export default SessionMainPage;
