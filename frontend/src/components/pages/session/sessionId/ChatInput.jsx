import React, { useRef, useState, useCallback } from "react";
import styles from "@/styles/components/Chat.module.scss";
import { SendOutlined, PauseCircleOutlined } from "@ant-design/icons";

export default function ChatInput({
  onSend,
  onPause,
  agentState,
  disabled,
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef(null);

  const isRunning = agentState === "running";
  const canSend = !isRunning && value.trim().length > 0 && !disabled;

  const handleSend = useCallback(() => {
    if (!canSend) return;
    onSend(value.trim());
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [canSend, value, onSend]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 150) + "px";
    }
  }, []);

  const statusLabel =
    agentState === "running"
      ? "Agent is working..."
      : agentState === "paused"
        ? "Agent paused"
        : agentState === "waiting_consent"
          ? "Waiting for your approval"
          : agentState === "waiting_manual_execution"
            ? "Waiting for command output"
            : "Ready";

  const isReady = !["running", "paused", "waiting_consent", "waiting_manual_execution"].includes(agentState);

  const statusClass =
    agentState === "running"
      ? styles.running
      : agentState === "paused"
        ? styles.paused
        : agentState === "waiting_consent" || agentState === "waiting_manual_execution"
          ? styles.waitingConsent
          : styles.ready;

  return (
    <div className={styles.inputArea}>
      <div className={styles.inputWrapper}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={
            isRunning
              ? "Agent is working... click pause to interrupt"
              : "Describe your target or ask a question..."
          }
          rows={1}
          disabled={isRunning}
        />
        <div className={styles.inputActions}>
          {isRunning ? (
            <button
              className={styles.pauseButton}
              onClick={onPause}
              title="Pause agent"
            >
              <PauseCircleOutlined />
            </button>
          ) : (
            <button
              className={styles.sendButton}
              onClick={handleSend}
              disabled={!canSend}
              title="Send message"
            >
              <SendOutlined />
            </button>
          )}
        </div>
      </div>
      <div className={styles.statusBar}>
        <span className={`${styles.statusDot} ${statusClass}`} />
        <span className={isReady ? styles.statusReady : ""}>{statusLabel}</span>
      </div>
    </div>
  );
}
