"use client";

import { getBrowserAgentVNC, getMagnitudeConfig } from "@/services/user.service";
import { updateSessions } from "@/store/user.slice";
import { Spin, Result, Button } from "antd";
import { GlobalOutlined, SettingOutlined, DesktopOutlined, ReloadOutlined } from "@ant-design/icons";
import { use, useMemo } from "react";
import { useQuery } from "react-query";
import { useDispatch, useSelector } from "react-redux";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URI || "http://localhost:8080";

const BrowserAgentPage = ({ params }) => {
  const { session_id: sessionId } = use(params);
  const dispatch = useDispatch();
  const { sessions } = useSelector((state) => state.user);

  const baSession = sessions.find((session) => session.type === "browser-agent");

  if (!baSession) {
    const allSessions = sessions.map((session) => ({
      ...session,
      is_active: false,
    }));

    dispatch(
      updateSessions([
        ...allSessions,
        {
          id: sessionId + "/browser-agent",
          is_main: false,
          is_active: true,
          type: "browser-agent",
        },
      ])
    );
  }

  const { data: magnitudeConfig, isLoading: configLoading } = useQuery(
    "magnitude-config",
    getMagnitudeConfig,
    { staleTime: 30000 }
  );

  const { data: vncData, isLoading: vncLoading, refetch: refetchVnc } = useQuery(
    "browser-agent-vnc",
    getBrowserAgentVNC,
    {
      enabled: !!magnitudeConfig?.enabled,
      staleTime: 30000,
      // The container's watchdog restarts a dead VNC stack on its own, so poll
      // while it is down and let the view recover without a manual reload.
      refetchInterval: (data) =>
        data?.mode === "docker" && data?.available && !data?.vncRunning
          ? 3000
          : false,
    }
  );

  const novncUrl = useMemo(() => {
    if (!vncData?.novncPort) return null;
    try {
      const backendOrigin = new URL(BACKEND_URL);
      return `${backendOrigin.protocol}//${backendOrigin.hostname}:${vncData.novncPort}`;
    } catch {
      return `http://localhost:${vncData.novncPort}`;
    }
  }, [vncData]);

  if (configLoading || vncLoading) {
    return (
      <div style={{ padding: "4rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
        <Spin size="large" />
        <span style={{ color: "var(--secondary-text)", fontSize: "0.85rem" }}>
          Loading Browser Agent...
        </span>
      </div>
    );
  }

  if (!magnitudeConfig?.enabled) {
    return (
      <div style={{ padding: "3rem", display: "flex", justifyContent: "center" }}>
        <Result
          icon={<GlobalOutlined style={{ color: "var(--primary-purple, #7c3aed)" }} />}
          title="Browser Agent Not Enabled"
          subTitle="Enable the Magnitude browser agent in Settings to use the live browser view."
          extra={
            <Button
              type="primary"
              icon={<SettingOutlined />}
              onClick={() => {
                const event = new CustomEvent("open-settings", { detail: { tab: "magnitude" } });
                window.dispatchEvent(event);
              }}
              style={{
                background: "var(--primary-purple, #7c3aed)",
                borderColor: "var(--primary-purple, #7c3aed)",
              }}
            >
              Open Browser Agent Settings
            </Button>
          }
        />
      </div>
    );
  }

  if (!vncData?.available) {
    return (
      <div style={{ padding: "3rem", display: "flex", justifyContent: "center" }}>
        <Result
          icon={<GlobalOutlined style={{ color: "var(--primary-purple, #7c3aed)" }} />}
          title="Headed Mode Not Active"
          subTitle="The browser agent is running in headless mode. Disable headless mode in Settings to see the live browser view."
          extra={
            <Button
              type="primary"
              icon={<SettingOutlined />}
              onClick={() => {
                const event = new CustomEvent("open-settings", { detail: { tab: "magnitude" } });
                window.dispatchEvent(event);
              }}
              style={{
                background: "var(--primary-purple, #7c3aed)",
                borderColor: "var(--primary-purple, #7c3aed)",
              }}
            >
              Open Browser Agent Settings
            </Button>
          }
        />
      </div>
    );
  }

  if (vncData?.mode === "dev") {
    return (
      <div style={{ padding: "3rem", display: "flex", justifyContent: "center" }}>
        <Result
          icon={<DesktopOutlined style={{ color: "var(--primary-purple, #7c3aed)" }} />}
          title="Developer Mode — Browser Opens on Desktop"
          subTitle={
            <span>
              You are running in developer mode. When the browser agent runs, Chromium will open
              directly on your desktop (display <code>{vncData.display}</code>).
              <br /><br />
              The live VNC stream is only available when running via Docker.
            </span>
          }
          extra={
            <Button
              type="primary"
              icon={<SettingOutlined />}
              onClick={() => {
                const event = new CustomEvent("open-settings", { detail: { tab: "magnitude" } });
                window.dispatchEvent(event);
              }}
              style={{
                background: "var(--primary-purple, #7c3aed)",
                borderColor: "var(--primary-purple, #7c3aed)",
              }}
            >
              Open Browser Agent Settings
            </Button>
          }
        />
      </div>
    );
  }

  // Headed mode is configured, but the VNC stack in the container is not
  // serving. Without this the iframe loads noVNC against a dead RFB port and
  // the user only sees noVNC's own "Failed to connect to server" banner.
  if (!vncData?.vncRunning) {
    return (
      <div style={{ padding: "3rem", display: "flex", justifyContent: "center" }}>
        <Result
          status="warning"
          title="Live Browser View Unavailable"
          subTitle={
            <span>
              The backend&apos;s VNC stack is not serving on display{" "}
              <code>{vncData?.display}</code>
              {vncData?.novncUp && !vncData?.rfbUp
                ? " — noVNC is up but the VNC server behind it is down."
                : " — the stream is starting or has stopped."}
              <br />
              <br />
              The container restarts it automatically; this page will reconnect
              on its own.
            </span>
          }
          extra={
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={() => refetchVnc()}
              style={{
                background: "var(--primary-purple, #7c3aed)",
                borderColor: "var(--primary-purple, #7c3aed)",
              }}
            >
              Retry Now
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div style={{ height: "800px" }}>
      <iframe
        style={{ position: "static" }}
        id="browser-agent-vnc"
        src={`${novncUrl}/vnc.html?autoconnect=true&resize=remote`}
        width="100%"
        height="100%"
        frameBorder="0"
        allow="fullscreen"
      >
        Browser not compatible.
      </iframe>
    </div>
  );
};

export default BrowserAgentPage;
