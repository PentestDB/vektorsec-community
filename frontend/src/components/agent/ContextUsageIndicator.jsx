import React, { useMemo, useState, useRef, useCallback, useEffect } from "react";
import styles from "@/styles/pages/Session.module.scss";

function formatTokenCount(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function HelpTip({ text }) {
  const [visible, setVisible] = useState(false);
  const timeout = useRef(null);

  const show = useCallback(() => { clearTimeout(timeout.current); setVisible(true); }, []);
  const hide = useCallback(() => { timeout.current = setTimeout(() => setVisible(false), 100); }, []);
  useEffect(() => () => clearTimeout(timeout.current), []);

  return (
    <span
      className={styles.contextHelpWrap}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <span className={styles.contextHelpIcon}>?</span>
      {visible && (
        <span
          className={styles.contextHelpTip}
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          {text}
        </span>
      )}
    </span>
  );
}

export default function ContextUsageIndicator({ tokenUsage }) {
  const { totalTokens = 0, contextLimit = 128_000, promptTokens, completionTokens } = tokenUsage || {};

  const pct = useMemo(
    () => Math.min((totalTokens / contextLimit) * 100, 100),
    [totalTokens, contextLimit],
  );

  const remaining = Math.max(contextLimit - totalTokens, 0);

  const radius = 13;
  const stroke = 2.5;
  const size = (radius + stroke) * 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (pct / 100) * circumference;

  const ringColor =
    pct >= 85 ? "#ff4d4f" : pct >= 60 ? "#faad14" : "#4a9eff";

  return (
    <div className={styles.contextPanel}>
      <div className={styles.contextHeader}>
        <svg
          width={28}
          height={28}
          viewBox={`0 0 ${size} ${size}`}
          className={styles.contextDonut}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={ringColor}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dashoffset 0.4s ease, stroke 0.3s ease" }}
          />
        </svg>
        <div className={styles.contextHeaderText}>
          <span className={styles.contextPct}>{Math.round(pct)}%</span>
          <span className={styles.contextSubtitle}>context used</span>
        </div>
      </div>

      <div className={styles.contextBar}>
        <div
          className={styles.contextBarFill}
          style={{ width: `${pct}%`, backgroundColor: ringColor }}
        />
      </div>

      <div className={styles.contextDetails}>
        <div className={styles.contextRow}>
          <span>Tokens</span>
          <span>{totalTokens.toLocaleString()}</span>
        </div>
        <div className={styles.contextRow}>
          <span>Limit</span>
          <span>{formatTokenCount(contextLimit)}</span>
        </div>
        <div className={styles.contextRow}>
          <span className={styles.contextRowWithHelp}>
            Remaining
            <HelpTip text="When the context limit is approached, Copilot will automatically summarize the conversation to free up space. Your session will continue uninterrupted." />
          </span>
          <span>{formatTokenCount(remaining)}</span>
        </div>
        {promptTokens != null && (
          <>
            <div className={styles.contextDivider} />
            <div className={styles.contextRow}>
              <span>Last prompt</span>
              <span>{promptTokens.toLocaleString()}</span>
            </div>
            <div className={styles.contextRow}>
              <span>Last completion</span>
              <span>{(completionTokens ?? 0).toLocaleString()}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
