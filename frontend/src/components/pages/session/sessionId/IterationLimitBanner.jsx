import React from "react";
import { CaretRightOutlined, StopOutlined } from "@ant-design/icons";
import styles from "@/styles/components/Chat.module.scss";
import { useTranslation } from "@/i18n/I18nProvider";

export default function IterationLimitBanner({ limit, onContinue, onStop }) {
  const { t } = useTranslation();
  return (
    <div className={styles.iterationLimitBanner} role="status">
      <div className={styles.iterationLimitCopy}>
        <div className={styles.iterationLimitEyebrow}>{t("chat.iteration.eyebrow")}</div>
        <div className={styles.iterationLimitTitle}>
          {t("chat.iteration.title", { limit })}
        </div>
        <div className={styles.iterationLimitDescription}>
          {t("chat.iteration.description", { limit })}
        </div>
      </div>
      <div className={styles.iterationLimitActions}>
        <button
          type="button"
          className={styles.iterationContinueBtn}
          onClick={onContinue}
        >
          <CaretRightOutlined />
          <span>{t("chat.iteration.continue", { limit })}</span>
        </button>
        <button
          type="button"
          className={styles.iterationStopBtn}
          onClick={onStop}
        >
          <StopOutlined />
          <span>{t("chat.iteration.stop")}</span>
        </button>
      </div>
    </div>
  );
}
