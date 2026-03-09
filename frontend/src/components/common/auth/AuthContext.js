"use client";

import React, { useEffect } from "react";
import { App, Spin } from "antd";
import styles from "@/app/page.module.scss";
import { checkSession } from "@/services/auth.service";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "react-query";
import { useDispatch } from "react-redux";
import { loginUser, logout } from "@/store/user.slice";
import MobileScreen from "./MobileScreen";

export const AuthContextProvider = ({ children }) => {
  const [loading, setLoading] = React.useState(true);
  const dispatch = useDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { notification } = App.useApp();

  const referral = searchParams.get("referral");

  useEffect(() => {
    if (referral) {
      localStorage.setItem("referral", referral);
    }
  }, [referral]);

  useQuery(["check-session"], checkSession, {
    onSuccess: (data) => {
      dispatch(loginUser(data.user));
      setLoading(false);

      if (pathname === "/onboarding") {
        if (!data.user.firstLogin) {
          router.replace("/dashboard");
        }
      }

      if (
        pathname === "/" ||
        pathname === "/login" ||
        pathname === "/register" ||
        pathname === "/dashboard"
      ) {
        router.push(data.user.firstLogin ? "/onboarding" : "/dashboard");
      }
    },
    onError: () => {
      // if path doesnt include login, redirect to login
      if (
        pathname !== "/" &&
        !pathname.includes("/login") &&
        !pathname.includes("/register") &&
        pathname !== "/no-access" &&
        pathname !== "/onboarding"
      ) {
        notification.error({
          message: "Session Expired or Invalid",
          description: "Please login again!",
        });
        dispatch(logout());
        router.replace("/login");
      }
      setLoading(false);
    },
  });

  return (
    <>
      {loading ? (
        <div className={styles.container}>
          <h1>Checking if you are logged-in</h1>
          <Spin size="large" />
        </div>
      ) : pathname === "/login" ? (
        <>{children}</>
      ) : (
        <>
          <div className={styles.pageWrapper}>{children}</div>
          <MobileScreen />
        </>
      )}
    </>
  );
};
