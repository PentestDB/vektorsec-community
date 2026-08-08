"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "@/styles/components/Common.module.scss";
import { useRouter } from "next/navigation";
import { App, Tooltip } from "antd";
import { useDispatch, useSelector } from "react-redux";
import { logoutUser } from "@/services/auth.service";
import { useMutation } from "react-query";
import Link from "next/link";
import { RiLogoutCircleRLine, RiSettings3Line } from "react-icons/ri";
import { FaGithub } from "react-icons/fa";
import { FiFlag } from "react-icons/fi";
import {
  CheckCircleFilled,
  ClockCircleOutlined,
  CloseCircleFilled,
  RobotOutlined,
} from "@ant-design/icons";
import { logout } from "@/store/user.slice";
import CopilotLogo from "./CopilotLogo";
import SettingsOverlay from "./SettingsOverlay";
import { FaCoins } from "react-icons/fa";

const CTF_STATUS = {
  solved: { icon: <CheckCircleFilled />, label: "Solved", cls: "ctfStatusSolved" },
  submitted: { icon: <CheckCircleFilled />, label: "Submitted", cls: "ctfStatusSolved" },
  flag_found: { icon: <RobotOutlined />, label: "Flag found", cls: "ctfStatusFound" },
  incorrect: { icon: <CloseCircleFilled />, label: "Incorrect", cls: "ctfStatusIncorrect" },
  solving: { icon: <ClockCircleOutlined />, label: "Solving", cls: "ctfStatusSolving" },
  pending: { icon: null, label: "Pending", cls: "ctfStatusPending" },
};

const HeaderLinks = ({ sessionId, sessionName, sessionInfo, logoVisible = true }) => {
  const router = useRouter();
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.user);
  const { message } = App.useApp();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState(null);

  const handleOpenSettings = useCallback((e) => {
    const tab = e.detail?.tab || null;
    setSettingsInitialTab(tab);
    setSettingsOpen(true);
  }, []);

  useEffect(() => {
    window.addEventListener("open-settings", handleOpenSettings);
    return () => window.removeEventListener("open-settings", handleOpenSettings);
  }, [handleOpenSettings]);

  const logoutMutation = useMutation(logoutUser, {
    onSuccess: (data) => {
      router.push("/");
      dispatch(logout());
      message.success(data?.message ?? "Logged out successfully!");
    },
    onError: (err) => {
      message.error(
        err?.response?.data?.message ?? "Failed to logout. Please try again."
      );
    },
  });

  return (
    <>
      <div className={styles.headerLinkWrapper}>
        {sessionId ? (
          <div className={styles.sessionIdGroup}>
            {sessionInfo?.isCTF && sessionInfo?.ctf ? (
              <>
                <span className={styles.ctfBadge}>
                  <FiFlag size={11} /> {sessionInfo.ctf.ctfName}
                </span>
                <span className={styles.sessionId}>#{sessionId}</span>

                <span className={styles.sessionName}>{sessionInfo.name}</span>
                {sessionInfo.ctf.category && (
                  <span className={styles.ctfMeta}>{sessionInfo.ctf.category}</span>
                )}
                {sessionInfo.ctf.points != null && (
                  <span className={styles.ctfMeta}>{sessionInfo.ctf.points} pts</span>
                )}

                {sessionInfo.ctf.flag && (
                  <Tooltip title={sessionInfo.ctf.flag}>
                    <code className={styles.ctfFlag}>{sessionInfo.ctf.flag}</code>
                  </Tooltip>
                )}
                {(() => {
                  const st = CTF_STATUS[sessionInfo.ctf.status] || CTF_STATUS.pending;
                  return (
                    <span className={`${styles.ctfStatus} ${styles[st.cls]}`}>
                      {st.icon} {st.label}
                    </span>
                  );
                })()}
              </>
            ) : (
              <>
                {sessionName && <span className={styles.sessionName}>{sessionName}</span>}
                <span className={styles.sessionId}>#{sessionId}</span>
              </>
            )}
          </div>
        ) : (
          <>
            {logoVisible ? (
              <Link
                href="/dashboard"
                style={{
                  textDecoration: "none",
                }}
              >
                <CopilotLogo />
              </Link>
            ) : (
              <div />
            )}
          </>
        )}
        <div className={styles.options}>
          <div className={styles.tokenWidget}>
            <FaCoins className={styles.tokenIcon} />
            <span className={styles.tokenLabel}>Tokens</span>
            <span className={styles.tokenValue}>
              {(user?.credits ?? 10000).toLocaleString()}
            </span>
            <button
              type="button"
              className={styles.topUpBtn}
              onClick={() => router.push("/topup")}
            >
              + Top Up
            </button>
          </div>
          <div className={styles.username}>{user.name}</div>
          <a
            href="https://github.com/PentestDB"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.headerIconBtn}
            title="Star on GitHub"
          >
            <FaGithub />
          </a>
          <button
            className={styles.headerIconBtn}
            onClick={() => setSettingsOpen(true)}
            title="Settings"
          >
            <RiSettings3Line />
          </button>
          <button
            className={`${styles.headerIconBtn} ${styles.headerLogoutBtn}`}
            onClick={async () => await logoutMutation.mutateAsync()}
            title="Logout"
          >
            <RiLogoutCircleRLine />
          </button>
        </div>
      </div>
      <SettingsOverlay
        open={settingsOpen}
        onClose={() => { setSettingsOpen(false); setSettingsInitialTab(null); }}
        initialTab={settingsInitialTab}
      />
    </>
  );
};

export default HeaderLinks;
