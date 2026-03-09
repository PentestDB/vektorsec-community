"use client";

import { AuthContextProvider } from "@/components/common/auth/AuthContext";
import Loader from "@/components/common/loader/Loader";
import Sidebar from "@/components/common/Sidebar";
import HeaderLinks from "@/components/common/HeaderLinks";
import React, { use } from "react";
import { useSelector } from "react-redux";
import styles from "@/styles/pages/Session.module.scss";

const SessionLayout = ({ children, params }) => {
  const { session_id } = use(params);
  const { user } = useSelector((state) => state.user);

  if (!user) {
    return <Loader />;
  }

  return (
    <AuthContextProvider>
      <div className={styles.sessionPage}>
        <Sidebar sessionId={session_id} />
        <div className={styles.sessionMainArea}>
          <HeaderLinks sessionId={session_id} />
          <div className={styles.sessionContent}>
            {children}
          </div>
        </div>
      </div>
    </AuthContextProvider>
  );
};

export default SessionLayout;
