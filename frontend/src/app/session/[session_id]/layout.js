"use client";

import { AuthContextProvider } from "@/components/common/auth/AuthContext";
import Loader from "@/components/common/loader/Loader";
import Sidebar from "@/components/common/Sidebar";
import HeaderLinks from "@/components/common/HeaderLinks";
import AgentStreamConnector from "@/components/common/AgentStreamConnector";
import ModelSetupGate from "@/components/common/ModelSetupGate";
import React, { use } from "react";
import { useSelector } from "react-redux";
import { useQuery } from "react-query";
import { getSessionInfo } from "@/services/agent.service";
import styles from "@/styles/pages/Session.module.scss";

const SessionLayout = ({ children, params }) => {
  const { session_id } = use(params);
  const { user } = useSelector((state) => state.user);

  const { data: sessionInfo } = useQuery(
    ["session-info", session_id],
    () => getSessionInfo(session_id),
    { enabled: !!user && !!session_id, refetchInterval: 10000 }
  );

  if (!user) {
    return <Loader />;
  }

  return (
    <AuthContextProvider>
      <ModelSetupGate>
        <AgentStreamConnector sessionId={session_id} />
        <div className={styles.sessionPage}>
          <Sidebar
            sessionId={session_id}
            workspaceId={sessionInfo?.workspaceId}
          />
          <div className={styles.sessionMainArea}>
            <HeaderLinks sessionId={session_id} sessionInfo={sessionInfo} />
            <div className={styles.sessionContent}>
              {children}
            </div>
          </div>
        </div>
      </ModelSetupGate>
    </AuthContextProvider>
  );
};

export default SessionLayout;
