"use client";

import HeaderLinks from "@/components/common/HeaderLinks";
import SettingsSidebar from "@/components/common/SettingsSidebar";
import { AuthContextProvider } from "@/components/common/auth/AuthContext";
import { Col, Row } from "antd";
import React from "react";
import styles from "@/styles/pages/Session.module.scss";
import { usePathname, useRouter } from "next/navigation";

const SettingsLayout = ({ children }) => {
  const pathname = usePathname();
  const router = useRouter();

  const getPageTitle = () => {
    switch (pathname) {
      case "/settings":
        return "My Account";
      case "/settings/tools":
        return "Tools";
      case "/settings/capabilities":
        return "Capabilities";
      case "/settings/billing":
        return "Billing";
      case "/settings/usage":
        return "Usage History";
      case "/settings/storage":
        return "Storage";
      case "/settings/models":
        return "Models";
      case "/settings/ssh":
        return "SSH / Exploit Box";
      case "/settings/billing/choose-plan":
        return "Choose plan";
      default:
        router.push("/settings");
        return "My Account";
    }
  };

  return (
    <AuthContextProvider>
      <Row className={styles.mainLayoutContainer}>
        <SettingsSidebar />
        <Col span={20} className={styles.mainContent}>
          <HeaderLinks logoVisible={false} />
          <Row
            align="middle"
            justify="space-between"
            className={styles.settingsHeaderContainer}
          >
            <Col
              xs={24}
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div className={styles.sessionName}>{getPageTitle()}</div>
              {getPageTitle() === "Tools" && (
                <p className={styles.sessionDescription}>
                  Select tools you want to use in your exploit box.
                </p>
              )}
              {getPageTitle() === "Capabilities" && (
                <p className={styles.sessionDescription}>
                  Manage CLI tools and Python packages available on your exploit box.
                </p>
              )}
              {getPageTitle() === "Choose plan" && (
                <p className={styles.sessionDescription}>
                  Select plan that help&apos;s you grow
                </p>
              )}
            </Col>
          </Row>
          {children}
        </Col>
      </Row>
    </AuthContextProvider>
  );
};

export default SettingsLayout;
