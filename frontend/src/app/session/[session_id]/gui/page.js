"use client";

import { connectToVNC } from "@/services/copilot.service";
import { getVNCConfig } from "@/services/user.service";
import { updateSessions, updateVNC } from "@/store/user.slice";
import { Spin, Result, Button } from "antd";
import { DesktopOutlined, SettingOutlined } from "@ant-design/icons";
import { use, useState } from "react";
import { useQuery } from "react-query";
import { useDispatch, useSelector } from "react-redux";

const GUIpage = ({ params }) => {
  const { session_id: sessionId } = use(params);
  const dispatch = useDispatch();
  const { sessions } = useSelector((state) => state.user);
  const [settingsHint, setSettingsHint] = useState(false);

  const guiSession = sessions.find((session) => session.type === "gui");

  if (!guiSession) {
    const allSessions = sessions.map((session) => {
      return {
        ...session,
        is_active: false,
      };
    });

    dispatch(
      updateSessions([
        ...allSessions,
        {
          id: sessionId + "/gui",
          is_main: false,
          is_active: true,
          type: "gui",
        },
      ])
    );
  }

  const { data: vncConfig, isLoading: configLoading } = useQuery(
    "vnc-config",
    getVNCConfig,
    { staleTime: 30000 }
  );

  const { data, isLoading, error } = useQuery(
    ["connectVNC", sessionId],
    () => connectToVNC({ session_id: sessionId }),
    {
      enabled: !!vncConfig?.configured,
      retry: 1,
      onSuccess: (data) => {
        dispatch(
          updateVNC({
            host: data.vncURL,
            password: data.password,
            active: false,
          })
        );
      },
      onError: (err) => {
        if (err?.response?.data?.notConfigured) {
          setSettingsHint(true);
        }
      },
    }
  );

  if (configLoading) {
    return (
      <div style={{ padding: "4rem", display: "flex", justifyContent: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!vncConfig?.configured || settingsHint) {
    return (
      <div className="gui-result-wrapper" style={{ padding: "3rem", display: "flex", justifyContent: "center" }}>
        <Result
          icon={<DesktopOutlined style={{ color: "var(--primary-purple, #7c3aed)" }} />}
          title="GUI Desktop Not Configured"
          subTitle="Set up VNC from the settings to use a graphical desktop on your exploit box. You can auto-install with one click or connect to an existing VNC server."
          extra={
            <Button
              type="primary"
              icon={<SettingOutlined />}
              onClick={() => {
                const event = new CustomEvent("open-settings", { detail: { tab: "gui" } });
                window.dispatchEvent(event);
              }}
              style={{
                background: "var(--primary-purple, #7c3aed)",
                borderColor: "var(--primary-purple, #7c3aed)",
              }}
            >
              Open GUI Settings
            </Button>
          }
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        style={{
          padding: "4rem",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        <Spin size="large" />
        <span style={{ color: "var(--secondary-text)", fontSize: "0.85rem" }}>
          Starting VNC desktop session...
        </span>
      </div>
    );
  }

  if (error && !settingsHint) {
    const errMsg = error?.response?.data?.message || "Could not connect to VNC.";
    const isApiError = !!error?.response?.data?.message;
    return (
      <div className="gui-result-wrapper" style={{ padding: "3rem", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Result
          status="error"
          title="Failed to Connect to Server"
          subTitle={
            <span>
              {errMsg}
              {!isApiError && " Check your SSH and VNC settings."}
            </span>
          }
          extra={
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", maxWidth: 440 }}>
              <div style={{ fontSize: "0.78rem", color: "var(--secondary-text)", textAlign: "center", lineHeight: 1.5 }}>
                If the API succeeded but the iframe fails, ensure the Base URL in Settings &gt; GUI is reachable from your browser (e.g. localhost or your VPN hostname).
              </div>
              <Button
                type="primary"
                icon={<SettingOutlined />}
                onClick={() => {
                  const event = new CustomEvent("open-settings", { detail: { tab: "gui" } });
                  window.dispatchEvent(event);
                }}
                style={{
                  background: "var(--primary-purple, #7c3aed)",
                  borderColor: "var(--primary-purple, #7c3aed)",
                }}
              >
                Check GUI Settings
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const vncBase = data.vncURL?.startsWith("http://") || data.vncURL?.startsWith("https://")
    ? data.vncURL
    : `http://${data.vncURL}`;

  return (
    <>
      {data && (
        <div style={{ height: "800px" }}>
          <iframe
            style={{ position: "static" }}
            id="remote-connection-2"
            src={`${vncBase}/vnc.html?password=${data.password}&resize=remote&autoconnect=true`}
            width="100%"
            height="100%"
            frameBorder="0"
            allow="fullscreen"
          >
            Browser not compatible.
          </iframe>
        </div>
      )}
    </>
  );
};

export default GUIpage;
