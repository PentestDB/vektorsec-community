"use client";

import { useState, useEffect, useCallback } from "react";
import { RiAccountCircleLine, RiCloseLine } from "react-icons/ri";
import {
  TbTools,
  TbBrain,
  TbTerminal2,
  TbDeviceDesktop,
  TbRadar,
  TbWorldWww,
  TbAdjustmentsHorizontal,
  TbCreditCard,
} from "react-icons/tb";
import styles from "@/styles/components/SettingsOverlay.module.scss";
import MyAccount from "@/components/pages/settings/MyAccount";
import CapabilitiesPage from "@/components/pages/settings/Capabilities";
import ModelsPage from "@/components/pages/settings/Models";
import SSHPage from "@/components/pages/settings/SSH";
import GUISettingsPage from "@/components/pages/settings/GUISettings";
import BurpSettingsPage from "@/components/pages/settings/BurpSettings";
import CaidoSettingsPage from "@/components/pages/settings/CaidoSettings";
import MagnitudeSettingsPage from "@/components/pages/settings/MagnitudeSettings";
import MCPSettingsPage from "@/components/pages/settings/MCPSettings";
import AgentBehaviorPage from "@/components/pages/settings/AgentBehavior";
import BillingPage from "@/components/pages/BillingPage";

const TABS = [
  {
    key: "account",
    label: "My Account",
    icon: RiAccountCircleLine,
    component: MyAccount,
  },
  {
    key: "billing",
    label: "Billing",
    description: "Manage your plan, subscription, and usage.",
    icon: TbCreditCard,
    component: BillingPage,
  },
  {
    key: "capabilities",
    label: "Capabilities",
    description:
      "Manage CLI tools and Python packages available on your exploit box.",
    icon: TbTools,
    component: CapabilitiesPage,
  },
  {
    key: "models",
    label: "Models",
    description:
      "Configure reusable model presets and assign them to orchestrator, racers, and browser agent.",
    icon: TbBrain,
    component: ModelsPage,
  },
  {
    key: "agent-behavior",
    label: "Agent Behavior",
    description:
      "Configure how long autonomous agent runs can continue before pausing.",
    icon: TbAdjustmentsHorizontal,
    component: AgentBehaviorPage,
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
    description:
      "Set up a remote desktop on your exploit box for graphical tools.",
    icon: TbDeviceDesktop,
    component: GUISettingsPage,
  },
  {
    key: "burp",
    label: "Burp Suite",
    description: "Connect to a Burp Suite instance via the Burp RPC extension.",
    icon: TbRadar,
    component: BurpSettingsPage,
  },
  {
    key: "caido",
    label: "Caido",
    description: "Configure URL, token, and proxy settings.",
    icon: TbRadar,
    component: CaidoSettingsPage,
  },
  {
    key: "magnitude",
    label: "Browser Agent",
    description:
      "Configure Magnitude for agentic browser automation during pentests.",
    icon: TbWorldWww,
    component: MagnitudeSettingsPage,
  },
  {
    key: "mcp",
    label: "MCP Access",
    description:
      "Generate MCP tokens and copy the backend-integrated MCP endpoint config.",
    icon: TbWorldWww,
    component: MCPSettingsPage,
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
    [onClose],
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
                  activeTab === tab.key ? styles.navItemActive : styles.navItem
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
            <ActiveComponent onNavigate={setActiveTab} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsOverlay;
