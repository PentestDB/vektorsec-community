import React, { useState } from "react";
import { DownloadOutlined, LoadingOutlined, CheckOutlined, CloseOutlined } from "@ant-design/icons";
import styles from "@/styles/components/Chat.module.scss";
import { installCapability } from "@/services/agent.service";

export default function InstallSuggestionBanner({ suggestion, sessionId, onDismiss }) {
  const [installing, setInstalling] = useState(false);
  const [result, setResult] = useState(null);

  const handleInstall = async () => {
    setInstalling(true);
    try {
      const res = await installCapability({
        sessionId,
        capabilityName: suggestion.name,
      });
      setResult(res.success ? "success" : "failed");
      if (res.success) {
        setTimeout(onDismiss, 2000);
      }
    } catch {
      setResult("failed");
    } finally {
      setInstalling(false);
    }
  };

  if (result === "success") {
    return (
      <div className={styles.installBanner}>
        <div className={styles.installInfo}>
          <div className={styles.installHeader}>
            <div className={styles.installBadgeSuccess}>
              <CheckOutlined />
              <span>Installed</span>
            </div>
            <div className={styles.installTitleGroup}>
              <div className={styles.installTitle}>
                {suggestion.label} installed successfully
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.installBanner}>
      <div className={styles.installInfo}>
        <div className={styles.installHeader}>
          <div className={styles.installBadge}>
            <DownloadOutlined />
            <span>Missing Tool</span>
          </div>
          <div className={styles.installTitleGroup}>
            <div className={styles.installTitle}>
              {suggestion.label} is not installed
            </div>
            <div className={styles.installSubtitle}>
              {suggestion.size} &middot; {suggestion.installCommand}
            </div>
          </div>
          <div className={styles.consentActions}>
            <button
              className={styles.consentApproveBtn}
              onClick={handleInstall}
              disabled={installing}
              title="Install"
              aria-label="Install"
            >
              {installing ? <LoadingOutlined spin /> : <DownloadOutlined />}
            </button>
            <button
              className={styles.consentDenyBtn}
              onClick={onDismiss}
              disabled={installing}
              title="Dismiss"
              aria-label="Dismiss"
            >
              <CloseOutlined />
            </button>
          </div>
        </div>
        {result === "failed" && (
          <div className={styles.installError}>
            Installation failed. Try running manually or use run_install_tool.
          </div>
        )}
      </div>
    </div>
  );
}
