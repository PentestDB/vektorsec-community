import React, { useState } from "react";
import { DownloadOutlined, LoadingOutlined, CheckOutlined, CloseOutlined } from "@ant-design/icons";
import styles from "@/styles/components/Chat.module.scss";
import { installCapability } from "@/services/agent.service";
import { useTranslation } from "@/i18n/I18nProvider";

export default function InstallSuggestionBanner({ suggestion, sessionId, onDismiss }) {
  const { t } = useTranslation();
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
            t("chat.install.exitCode", { code: res.exitCode ?? t("common.unknown") }),
        );
      }
    } catch (error) {
      setResult("failed");
      setErrorMessage(
        error?.response?.data?.message ||
          error?.message ||
          t("chat.install.failedDefault"),
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
              <span>{t("chat.install.badgeInstalled")}</span>
            </div>
            <div className={styles.installTitleGroup}>
              <div className={styles.installTitle}>
                {t("chat.install.installed", { label: suggestion.label })}
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
            <span>{t("chat.install.badgeMissing")}</span>
          </div>
          <div className={styles.installTitleGroup}>
            <div className={styles.installTitle}>
              {t("chat.install.notInstalled", { label: suggestion.label })}
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
              <span>
                {installing
                  ? t("chat.install.installing")
                  : result === "failed"
                    ? t("common.retry")
                    : t("chat.install.install")}
              </span>
            </button>
            <button
              className={styles.installDismissBtn}
              onClick={onDismiss}
              disabled={installing}
            >
              <CloseOutlined />
              <span>{t("chat.install.dismiss")}</span>
            </button>
          </div>
        </div>
        {result === "failed" && (
          <div className={styles.installError}>
            <strong>{t("chat.install.failedTitle")}</strong>
            <span>{errorMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
}
