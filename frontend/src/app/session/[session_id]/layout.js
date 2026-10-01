"use client";

import { AuthContextProvider } from "@/components/common/auth/AuthContext";
import Loader from "@/components/common/loader/Loader";
import Sidebar from "@/components/common/Sidebar";
import HeaderLinks from "@/components/common/HeaderLinks";
import AgentStreamConnector from "@/components/common/AgentStreamConnector";
import ModelSetupGate from "@/components/common/ModelSetupGate";
import PrimaryButton from "@/components/common/PrimaryButton";
import React, { use } from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import { useQuery } from "react-query";
import { getSessionInfo } from "@/services/agent.service";
import { useTranslation } from "@/i18n/I18nProvider";
import styles from "@/styles/pages/Session.module.scss";

const SessionLayout = ({ children, params }) => {
  const { session_id } = use(params);
  const { user } = useSelector((state) => state.user);
  const { t } = useTranslation();
  const router = useRouter();

  const { data: sessionInfo, error } = useQuery(
    ["session-info", session_id],
    () => getSessionInfo(session_id),
    {
      enabled: !!user && !!session_id,
      // A 400/404 (archived or deleted session) never turns into a success, so
      // retrying only fills the console.
      retry: false,
      // Keep polling while the session answers, stop as soon as it is gone.
      refetchInterval: (data, query) => (query.state.error ? false : 10000),
    }
  );

  if (!user) {
    return <Loader />;
  }

  // The backend answers 400 when the session is not the caller's active one
  // (deleted, archived, or an old link) and 404 in a few places. Rendering the
  // session shell in that state kept asking for a session that can never come
  // back — session info + vulnerabilities every few seconds, plus the shell
  // WebSocket — so offer a way out instead.
  const status = error?.response?.status;
  if (status === 400 || status === 404) {
    return (
      <div className={styles.sessionMissing}>
        <h2>{t("session.missingTitle")}</h2>
        <p>{t("session.missingBody")}</p>
        <PrimaryButton purple onClick={() => router.push("/dashboard")}>
          {t("session.backToDashboard")}
        </PrimaryButton>
      </div>
    );
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
