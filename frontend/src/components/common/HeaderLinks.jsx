"use client";

import styles from "@/styles/components/Common.module.scss";
import { useRouter } from "next/navigation";
import { Alert, Avatar, Button, Dropdown, message } from "antd";
import { useDispatch, useSelector } from "react-redux";
import { logoutUser } from "@/services/auth.service";
import { useMutation, useQuery } from "react-query";
import Link from "next/link";
import { getUserInfo } from "@/services/copilot.service";
import { RiLogoutCircleRLine, RiSettings3Line } from "react-icons/ri";
import { logout, update } from "@/store/user.slice";
import CopilotLogo from "./CopilotLogo";
import { BsArrowUpCircle } from "react-icons/bs";
import { AiOutlineCreditCard } from "react-icons/ai";
import { useEffect, useState } from "react";

const HeaderLinks = ({ sessionId, logoVisible = true }) => {
  const router = useRouter();
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.user);
  const [creditWarning, setCreditWarning] = useState(false);
  const [exploitWarning, setExploitWarning] = useState(false);

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

  const { data: userData } = useQuery(["fetch-user-details"], getUserInfo, {
    onSuccess: (data) => {
      const newUser = {
        ...user,
        name: data.name,
        plan: data.plan,
        gold: data.gold,
        email: data.email,
        profilePicture: data.profilePicture,
      };

      dispatch(update(newUser));
    },
  });

  const items = [
    {
      label: (
        <div
          className={styles.menuItem}
          onClick={() => router.push("/settings")}
        >
          <RiSettings3Line />
          Settings
        </div>
      ),
      key: "0",
    },
    {
      label: (
        <div
          className={styles.menuItem}
          onClick={() => router.push("/settings/billing")}
        >
          <AiOutlineCreditCard />
          Billing
        </div>
      ),
      key: "0",
    },
    {
      label: (
        <div
          className={styles.logout}
          onClick={async () => await logoutMutation.mutateAsync()}
        >
          <RiLogoutCircleRLine />
          Logout
        </div>
      ),
      key: "1",
    },
  ];

  useEffect(() => {
    const hideExploit = sessionStorage.getItem("hideExploitWarning");
    const hideCredit = sessionStorage.getItem("hideCreditWarning");

    setExploitWarning(userData?.exploitBoxLow && !hideExploit);
    setCreditWarning(userData?.creditLow && !hideCredit);
  }, [userData]);

  return (
    <>
      <div className={styles.headerLinkWrapper}>
        {sessionId ? (
          <div className={styles.sessionId}>#{sessionId}</div>
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
                <span
                  style={{
                    color: "#fff",
                    position: "relative",
                    zIndex: 1,
                    top: "-42px",
                    left: ".8rem",
                    border: "none",
                    fontSize: "14px",
                    fontWeight: "bold",
                  }}
                >
                  Public Beta
                </span>{" "}
              </Link>
            ) : (
              <div />
            )}
          </>
        )}
        <div className={styles.options}>
          {user && user.plan === "FREE" && (
            <Button
              className={styles.upgradeButton}
              onClick={() => router.push("/settings/billing/choose-plan")}
            >
              <BsArrowUpCircle />
              UPGRADE TO 1337
            </Button>
          )}
          <div className={styles.username}>{user.name}</div>
          <Dropdown
            menu={{ items }}
            trigger={["click"]}
            overlayClassName={styles.userDropdown}
          >
            <Avatar src={user.profilePicture} className={styles.avatar} />
          </Dropdown>
        </div>
      </div>
      {(exploitWarning || creditWarning) && (
        <div
          className={styles.alerts}
          style={{
            paddingBottom: "0.1rem",
          }}
        >
          {exploitWarning && (
            <Alert
              showIcon
              closable
              type="warning"
              className={styles.alertWarning}
              onClose={() => {
                setExploitWarning(false);
                sessionStorage.setItem("hideExploitWarning", 1);
              }}
              message="Your exploit box hours are running low. Please upgrade your plan to continue using Copilot."
            />
          )}
          {creditWarning && (
            <Alert
              showIcon
              closable
              type="error"
              className={styles.alertWarning}
              onClose={() => {
                setCreditWarning(false);
                sessionStorage.setItem("hideCreditWarning", 1);
              }}
              message="Your credits are running low. Please upgrade your plan to continue using Copilot."
            />
          )}
        </div>
      )}
    </>
  );
};

export default HeaderLinks;
