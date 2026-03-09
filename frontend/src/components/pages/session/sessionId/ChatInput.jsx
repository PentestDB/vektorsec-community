import React, { useRef, useState, useCallback, useMemo, useEffect } from "react";
import styles from "@/styles/components/Chat.module.scss";
import { SendOutlined, PauseCircleOutlined } from "@ant-design/icons";

const SLASH_COMMANDS = [
  { name: "summarize", description: "Summarize the entire session so far" },
  { name: "status", description: "Show current engagement status" },
  { name: "clear", description: "Clear the conversation context" },
  { name: "help", description: "List all available slash commands" },
  { name: "targets", description: "Extract and list all targets/IPs" },
  { name: "export", description: "Export findings as a structured report" },
  { name: "shells", description: "List all shell sessions" },
  { name: "reset", description: "Reset agent state to idle" },
];

export default function ChatInput({
  onSend,
  onPause,
  agentState,
  disabled,
}) {
  const [value, setValue] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef(null);
  const menuRef = useRef(null);

  const isRunning = agentState === "running";
  const canSend = !isRunning && value.trim().length > 0 && !disabled;

  const slashMatches = useMemo(() => {
    const trimmed = value.trimStart();
    if (!trimmed.startsWith("/")) return [];
    const partial = trimmed.split(/\s/)[0].slice(1).toLowerCase();
    if (trimmed.includes(" ")) return [];
    if (!partial) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter((cmd) => cmd.name.startsWith(partial));
  }, [value]);

  const showMenu = slashMatches.length > 0 && !isRunning;

  useEffect(() => {
    setSelectedIndex(0);
  }, [slashMatches.length]);

  const acceptCommand = useCallback(
    (cmd) => {
      setValue(`/${cmd.name} `);
      textareaRef.current?.focus();
    },
    [],
  );

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
      if (showMenu) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < slashMatches.length - 1 ? prev + 1 : 0,
          );
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : slashMatches.length - 1,
          );
          return;
        }
        if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
          e.preventDefault();
          const cmd = slashMatches[selectedIndex];
          if (cmd) {
            if (e.key === "Enter") {
              setValue(`/${cmd.name}`);
              setTimeout(() => {
                onSend(`/${cmd.name}`);
                setValue("");
              }, 0);
            } else {
              acceptCommand(cmd);
            }
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setValue("");
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend, showMenu, slashMatches, selectedIndex, acceptCommand, onSend],
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
      {showMenu && (
        <div className={styles.slashMenu} ref={menuRef}>
          <div className={styles.slashMenuHeader}>Commands</div>
          {slashMatches.map((cmd, i) => (
            <div
              key={cmd.name}
              className={`${styles.slashMenuItem} ${i === selectedIndex ? styles.slashMenuItemActive : ""}`}
              onMouseEnter={() => setSelectedIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                setValue(`/${cmd.name}`);
                setTimeout(() => {
                  onSend(`/${cmd.name}`);
                  setValue("");
                }, 0);
              }}
            >
              <span className={styles.slashMenuCmd}>/{cmd.name}</span>
              <span className={styles.slashMenuDesc}>{cmd.description}</span>
            </div>
          ))}
        </div>
      )}

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
              : "Describe your target or type / for commands..."
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
