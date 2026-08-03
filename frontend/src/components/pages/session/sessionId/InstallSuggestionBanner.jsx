import React, { useState } from "react";
import { DownloadOutlined, LoadingOutlined, CheckOutlined, CloseOutlined } from "@ant-design/icons";
import styles from "@/styles/components/Chat.module.scss";
import { installCapability } from "@/services/agent.service";

export default function InstallSuggestionBanner({ suggestion, sessionId, onDismiss }) {
  const [installing, setInstalling] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  const handleInstall = async () => {
    setInstalling(true);
    setErrorMessage("");
    try {
      const res = await installCapability({
        sessionId,
        capabilityName: suggestion.name,
      });
      setResult(res.success ? "success" : "failed");
      if (res.success) {
        setTimeout(onDismiss, 2000);
      } else {
        setErrorMessage(
          res.message ||
            res.output ||
            `Installation exited with code ${res.exitCode ?? "unknown"}.`,
        );
      }
    } catch (error) {
      setResult("failed");
      setErrorMessage(
        error?.response?.data?.message ||
          error?.message ||
          "The installation request failed.",
      );
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
          <div className={styles.installActions}>
            <button
              className={styles.installPrimaryBtn}
              onClick={handleInstall}
              disabled={installing}
            >
              {installing ? <LoadingOutlined spin /> : <DownloadOutlined />}
              <span>{installing ? "Installing…" : result === "failed" ? "Retry" : "Install"}</span>
            </button>
            <button
              className={styles.installDismissBtn}
              onClick={onDismiss}
              disabled={installing}
            >
              <CloseOutlined />
              <span>Dismiss</span>
            </button>
          </div>
        </div>
        {result === "failed" && (
          <div className={styles.installError}>
            <strong>Installation failed.</strong>
            <span>{errorMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
}
