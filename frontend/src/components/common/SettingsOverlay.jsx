"use client";

import { useState, useEffect, useCallback } from "react";
import { RiAccountCircleLine, RiCloseLine } from "react-icons/ri";
import {
  TbTools,
  TbBrain,
  TbRadar,
  TbTopologyStar3,
  TbWorldWww,
  TbAdjustmentsHorizontal,
  TbCreditCard,
  TbTerminal2,
} from "react-icons/tb";
import styles from "@/styles/components/SettingsOverlay.module.scss";
import MyAccount from "@/components/pages/settings/MyAccount";
import CapabilitiesPage from "@/components/pages/settings/Capabilities";
import ModelsPage from "@/components/pages/settings/Models";
import BurpSettingsPage from "@/components/pages/settings/BurpSettings";
import CaidoSettingsPage from "@/components/pages/settings/CaidoSettings";
import MythicSettingsPage from "@/components/pages/settings/MythicSettings";
import MagnitudeSettingsPage from "@/components/pages/settings/MagnitudeSettings";
import MCPSettingsPage from "@/components/pages/settings/MCPSettings";
import AgentBehaviorPage from "@/components/pages/settings/AgentBehavior";
import SSHPage from "@/components/pages/settings/SSH";
import BillingPage from "@/components/pages/BillingPage";
import { useTranslation } from "@/i18n/I18nProvider";

const TABS = [
  {
    key: "account",
    labelKey: "settings.tabs.account",
    icon: RiAccountCircleLine,
    component: MyAccount,
  },
  {
    key: "billing",
    labelKey: "settings.tabs.billing",
    descriptionKey: "settings.descriptions.billing",
    icon: TbCreditCard,
    component: BillingPage,
  },
  {
    key: "capabilities",
    labelKey: "settings.tabs.capabilities",
    descriptionKey: "settings.descriptions.capabilities",
    icon: TbTools,
    component: CapabilitiesPage,
  },
  {
    key: "models",
    labelKey: "settings.tabs.models",
    descriptionKey: "settings.descriptions.models",
    icon: TbBrain,
    component: ModelsPage,
  },
  {
    key: "agent-behavior",
    labelKey: "settings.tabs.agentBehavior",
    descriptionKey: "settings.descriptions.agentBehavior",
    icon: TbAdjustmentsHorizontal,
    component: AgentBehaviorPage,
  },
  {
    key: "ssh",
    labelKey: "settings.tabs.ssh",
    descriptionKey: "settings.descriptions.ssh",
    icon: TbTerminal2,
    component: SSHPage,
  },
  {
    key: "burp",
    labelKey: "settings.tabs.burp",
    descriptionKey: "settings.descriptions.burp",
    icon: TbRadar,
    component: BurpSettingsPage,
  },
  {
    key: "caido",
    labelKey: "settings.tabs.caido",
    descriptionKey: "settings.descriptions.caido",
    icon: TbRadar,
    component: CaidoSettingsPage,
  },
  {
    key: "mythic",
    labelKey: "settings.tabs.mythic",
    descriptionKey: "settings.descriptions.mythic",
    icon: TbTopologyStar3,
    component: MythicSettingsPage,
  },
  {
    key: "magnitude",
    labelKey: "settings.tabs.magnitude",
    descriptionKey: "settings.descriptions.magnitude",
    icon: TbWorldWww,
    component: MagnitudeSettingsPage,
  },
  {
    key: "mcp",
    labelKey: "settings.tabs.mcp",
    descriptionKey: "settings.descriptions.mcp",
    icon: TbWorldWww,
    component: MCPSettingsPage,
  },
];

const SettingsOverlay = ({ open, onClose, initialTab }) => {
  const { t } = useTranslation();
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

  const currentTab = TABS.find((tab) => tab.key === activeTab) || TABS[0];
  const ActiveComponent = currentTab.component;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.sidebar}>
          <div className={styles.sidebarTitle}>{t("settings.title")}</div>
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
                {t(tab.labelKey)}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.content}>
          <div className={styles.contentHeader}>
            <div>
              <div className={styles.contentTitle}>{t(currentTab.labelKey)}</div>
              {currentTab.descriptionKey && (
                <div className={styles.contentDescription}>
                  {t(currentTab.descriptionKey)}
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
