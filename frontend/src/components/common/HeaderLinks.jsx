"use client";

import { useState } from "react";
import styles from "@/styles/components/Common.module.scss";
import { useRouter } from "next/navigation";
import { App } from "antd";
import { useDispatch, useSelector } from "react-redux";
import { logoutUser } from "@/services/auth.service";
import { useMutation } from "react-query";
import Link from "next/link";
import { RiLogoutCircleRLine, RiSettings3Line } from "react-icons/ri";
import { logout } from "@/store/user.slice";
import CopilotLogo from "./CopilotLogo";
import SettingsOverlay from "./SettingsOverlay";

const HeaderLinks = ({ sessionId, sessionName, logoVisible = true }) => {
  const router = useRouter();
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.user);
  const { message } = App.useApp();
  const [settingsOpen, setSettingsOpen] = useState(false);

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
            {sessionName && <span className={styles.sessionName}>{sessionName}</span>}
            <span className={styles.sessionId}>#{sessionId}</span>
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
          <div className={styles.username}>{user.name}</div>
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
        onClose={() => setSettingsOpen(false)}
      />
    </>
  );
};

export default HeaderLinks;
