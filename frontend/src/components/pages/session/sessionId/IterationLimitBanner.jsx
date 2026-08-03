import React from "react";
import { CaretRightOutlined, StopOutlined } from "@ant-design/icons";
import styles from "@/styles/components/Chat.module.scss";

export default function IterationLimitBanner({ limit, onContinue, onStop }) {
  return (
    <div className={styles.iterationLimitBanner} role="status">
      <div className={styles.iterationLimitCopy}>
        <div className={styles.iterationLimitEyebrow}>Turn limit reached</div>
        <div className={styles.iterationLimitTitle}>
          The agent completed {limit} agentic turns
        </div>
        <div className={styles.iterationLimitDescription}>
          Keep the current context and continue for up to {limit} more turns,
          or stop here. You can change this limit in Settings → Agent Behavior.
        </div>
      </div>
      <div className={styles.iterationLimitActions}>
        <button
          type="button"
          className={styles.iterationContinueBtn}
          onClick={onContinue}
        >
          <CaretRightOutlined />
          <span>Continue {limit} turns</span>
        </button>
        <button
          type="button"
          className={styles.iterationStopBtn}
          onClick={onStop}
        >
          <StopOutlined />
          <span>Stop here</span>
        </button>
      </div>
    </div>
  );
}
