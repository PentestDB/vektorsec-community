"use client";

import React, { useEffect, useState } from "react";
import styles from "@/styles/components/CLIcomponent.module.scss";
import { ResizableBox } from "react-resizable";
import { useDispatch, useSelector } from "react-redux";
import { Tabs } from "antd";
import dynamic from "next/dynamic";
const TerminalSession = dynamic(() => import("./TerminalSession"), { ssr: false });
import { usePathname } from "next/navigation";
import {
  updateActiveTerminal,
  updateTerminalHeight,
} from "@/store/socket.slice";

const TerminalComponent = ({ show, readyToConnect }) => {
  const { sessions } = useSelector((state) => state.user);
  const pathname = usePathname();
  const { terminal_height, active_terminal } = useSelector(
    (state) => state.socket
  );

  const dispatch = useDispatch();

  const setTerminalHeight = (height) => {
    dispatch(updateTerminalHeight(height));
  };

  const setActiveTerminal = (key) => {
    dispatch(updateActiveTerminal(key));
  };

  const [resizeActive, setResizeActive] = useState(false);
  const [showTerminal, setShowTerminal] = useState(true);

  const getTabName = (sess) => {
    if (sess.title) {
      return sess.title;
    }
    if (sess.type === "session" && sess.is_main) {
      return "Main Session";
    } else if (sess.type === "session" && !sess.is_main) {
      return "Sub Session";
    } else if (sess.type === "netcat") {
      return "Netcat";
    } else if (sess.type === "vpn") {
      return "VPN";
    } else if (sess.type === "terminal") {
      return "Terminal";
    }
  };

  const getActiveKey = () => {
    const splitPath = pathname.split("/");

    if (splitPath.find((s) => s === "vpn")) {
      const sessionId = splitPath[2];
      const vpnkey = `${sessionId}/vpn`;

      return vpnkey;
    } else if (splitPath.find((s) => s === "netcat")) {
      const netcatId = splitPath[4];
      const netcat = sessions.find(
        (s) => s.type === "netcat" && s.id === netcatId
      );
      return netcat.id;
    } else if (splitPath.find((s) => s === "terminal")) {
      const terminalId = splitPath[4];
      const terminal = sessions.find(
        (s) => s.type === "terminal" && s.id === terminalId
      );
      return terminal.id;
    } else {
      const sessionId = splitPath[2];
      const session = sessions.find(
        (s) => s.type === "session" && s.id === sessionId
      );
      return session?.id;
    }
  };

  useEffect(() => {
    if (sessions.length > 0) {
      const activeTempTerminal = sessions.find(
        (session) => session.id === active_terminal && session.temporary
      );

      if (activeTempTerminal) {
        setShowTerminal(true);
        return;
      }

      const activeKey = getActiveKey();
      const sessionId = pathname.split("/")[2];
      if (activeKey !== `${sessionId}/vpn`) {
        setActiveTerminal(activeKey);
        setShowTerminal(true);
      } else {
        setActiveTerminal(null);
        setShowTerminal(false);
      }
    }
  }, [sessions, pathname, active_terminal]);

  return (
    <div className={styles.fixedOverlay}>
      <div className={styles.terminalHeader}>
        <div
          className={show ? styles.terminalWrapper : styles.terminalWrapperHide}
        >
          {showTerminal && (
            <ResizableBox
              className={styles.terminalContainer}
              height={terminal_height ?? 100}
              resizeHandles={["n"]}
              handle={
                <div
                  className={styles.resizeHandle}
                  style={
                    resizeActive ? { borderTop: "4px solid #d4d4d480" } : {}
                  }
                >
                  <div className={styles.dragIcon} />
                </div>
              }
              onResizeStart={(e, data) => {
                setResizeActive(true);
              }}
              onResizeStop={(e, data) => {
                setResizeActive(false);
                const height = data.size.height;
                setTerminalHeight(height);
              }}
              maxConstraints={[Infinity, typeof window !== 'undefined' ? window.innerHeight - 105 : 500]}
            >
              <section>
                <Tabs
                  activeKey={active_terminal}
                  onChange={(key) => setActiveTerminal(key)}
                  className={styles.terminalTabs}
                  style={{ height: `${terminal_height}` }}
                  items={sessions
                    .filter((session) => !["vpn", "gui"].includes(session.type))
                    .map((session) => ({
                      key: session.id,
                      label: getTabName(session),
                      children: (
                        <TerminalSession
                          session={session}
                          show={show}
                          active_terminal={active_terminal}
                          readyToConnect={readyToConnect}
                        />
                      ),
                    }))}
                />
              </section>
            </ResizableBox>
          )}
        </div>
      </div>
    </div>
  );
};

export default TerminalComponent;
