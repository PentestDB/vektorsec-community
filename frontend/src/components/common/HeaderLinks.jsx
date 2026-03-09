"use client";

import styles from "@/styles/components/Common.module.scss";
import { useRouter } from "next/navigation";
import { App, Avatar, Dropdown } from "antd";
import { useDispatch, useSelector } from "react-redux";
import { logoutUser } from "@/services/auth.service";
import { useMutation } from "react-query";
import Link from "next/link";
import { RiLogoutCircleRLine, RiSettings3Line } from "react-icons/ri";
import { logout } from "@/store/user.slice";
import CopilotLogo from "./CopilotLogo";

const HeaderLinks = ({ sessionId, logoVisible = true }) => {
  const router = useRouter();
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.user);
  const { message } = App.useApp();

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

  return (
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
            </Link>
          ) : (
            <div />
          )}
        </>
      )}
      <div className={styles.options}>
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
  );
};

export default HeaderLinks;
