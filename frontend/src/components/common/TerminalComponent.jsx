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
    if (sess.title) return sess.title;
    if (sess.type === "session" && sess.is_main) return "Main Session";
    if (sess.type === "session" && !sess.is_main) return "Sub Session";
    if (sess.type === "netcat") return "Netcat";
    if (sess.type === "vpn") return "VPN";
    if (sess.type === "terminal") return "Terminal";
  };

  const getActiveKey = () => {
    const splitPath = pathname.split("/");

    if (splitPath.find((s) => s === "vpn")) {
      const sessionId = splitPath[2];
      return `${sessionId}/vpn`;
    } else if (splitPath.find((s) => s === "netcat")) {
      const netcatId = splitPath[4];
      const netcat = sessions.find(
        (s) => s.type === "netcat" && s.id === netcatId
      );
      return netcat?.id;
    } else if (splitPath.find((s) => s === "terminal")) {
      const terminalId = splitPath[4];
      const terminal = sessions.find(
        (s) => s.type === "terminal" && s.id === terminalId
      );
      return terminal?.id;
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
        if (activeKey !== active_terminal) {
          setActiveTerminal(activeKey);
        }
        setShowTerminal(true);
      } else {
        setActiveTerminal(null);
        setShowTerminal(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, pathname]);

  if (!show || !showTerminal) return null;

  return (
    <div className={styles.terminalPanel}>
      <ResizableBox
        className={styles.terminalContainer}
        height={terminal_height ?? 200}
        resizeHandles={["n"]}
        handle={
          <div className={`${styles.resizeHandle} ${resizeActive ? styles.resizeActive : ""}`}>
            <div className={styles.dragIcon} />
          </div>
        }
        onResizeStart={() => setResizeActive(true)}
        onResizeStop={(e, data) => {
          setResizeActive(false);
          setTerminalHeight(data.size.height);
        }}
        maxConstraints={[Infinity, typeof window !== "undefined" ? window.innerHeight - 100 : 500]}
        minConstraints={[Infinity, 80]}
      >
        <section>
          <Tabs
            activeKey={active_terminal}
            onChange={(key) => setActiveTerminal(key)}
            className={styles.terminalTabs}
            style={{ height: `${terminal_height ?? 200}px` }}
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
    </div>
  );
};

export default TerminalComponent;
