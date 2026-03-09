"use client";

import { useState, useEffect, useCallback } from "react";
import { RiAccountCircleLine, RiCloseLine } from "react-icons/ri";
import { TbTools, TbBrain, TbTerminal2, TbDeviceDesktop } from "react-icons/tb";
import styles from "@/styles/components/SettingsOverlay.module.scss";
import MyAccount from "@/components/pages/settings/MyAccount";
import CapabilitiesPage from "@/components/pages/settings/Capabilities";
import ModelsPage from "@/components/pages/settings/Models";
import SSHPage from "@/components/pages/settings/SSH";
import GUISettingsPage from "@/components/pages/settings/GUISettings";

const TABS = [
  {
    key: "account",
    label: "My Account",
    icon: RiAccountCircleLine,
    component: MyAccount,
  },
  {
    key: "capabilities",
    label: "Capabilities",
    description: "Manage CLI tools and Python packages available on your exploit box.",
    icon: TbTools,
    component: CapabilitiesPage,
  },
  {
    key: "models",
    label: "Models",
    icon: TbBrain,
    component: ModelsPage,
  },
  {
    key: "ssh",
    label: "SSH / Exploit Box",
    icon: TbTerminal2,
    component: SSHPage,
  },
  {
    key: "gui",
    label: "GUI / VNC",
    description: "Set up a remote desktop on your exploit box for graphical tools.",
    icon: TbDeviceDesktop,
    component: GUISettingsPage,
  },
];

const SettingsOverlay = ({ open, onClose, initialTab }) => {
  const [activeTab, setActiveTab] = useState(initialTab || "account");

  useEffect(() => {
    if (initialTab && open) {
      setActiveTab(initialTab);
    }
  }, [initialTab, open]);

  const handleEscape = useCallback(
    (e) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [open, handleEscape]);

  if (!open) return null;

  const currentTab = TABS.find((t) => t.key === activeTab) || TABS[0];
  const ActiveComponent = currentTab.component;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.sidebar}>
          <div className={styles.sidebarTitle}>Settings</div>
          <div className={styles.navItems}>
            {TABS.map((tab) => (
              <div
                key={tab.key}
                className={
                  activeTab === tab.key
                    ? styles.navItemActive
                    : styles.navItem
                }
                onClick={() => setActiveTab(tab.key)}
              >
                <tab.icon className={styles.navIcon} />
                {tab.label}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.content}>
          <div className={styles.contentHeader}>
            <div>
              <div className={styles.contentTitle}>{currentTab.label}</div>
              {currentTab.description && (
                <div className={styles.contentDescription}>
                  {currentTab.description}
                </div>
              )}
            </div>
            <button className={styles.closeButton} onClick={onClose}>
              <RiCloseLine />
            </button>
          </div>
          <div className={styles.contentBody}>
            <ActiveComponent />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsOverlay;
