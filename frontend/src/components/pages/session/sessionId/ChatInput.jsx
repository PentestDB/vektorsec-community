import React, { useRef, useState, useCallback, useMemo, useEffect } from "react";
import styles from "@/styles/components/Chat.module.scss";
import { SendOutlined, PauseCircleOutlined, CloseOutlined } from "@ant-design/icons";
import { TbRadar } from "react-icons/tb";
import { getCtfChallenges } from "@/services/ctf.service";

const SLASH_COMMANDS = [
  { name: "summarize", description: "Summarize the entire session so far" },
  { name: "status", description: "Show current engagement status" },
  { name: "clear", description: "Clear the conversation context" },
  { name: "help", description: "List all available slash commands" },
  { name: "targets", description: "Extract and list all targets/IPs" },
  { name: "export", description: "Export findings as a structured report" },
  { name: "shells", description: "List all shell sessions" },
  { name: "reset", description: "Reset agent state to idle" },
  { name: "solve", description: "Focus on a CTF challenge" },
];

export default function ChatInput({
  sessionId,
  onSend,
  onPause,
  agentState,
  disabled,
  burpAttachment,
  onDismissBurpAttachment,
}) {
  const [value, setValue] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef(null);
  const menuRef = useRef(null);

  const [challengeList, setChallengeList] = useState([]);
  const [challengeSelectedIndex, setChallengeSelectedIndex] = useState(0);
  const challengeFetchedRef = useRef(null);

  const isRunning = agentState === "running";
  const canSend = !isRunning && (value.trim().length > 0 || !!burpAttachment) && !disabled;

  const slashMatches = useMemo(() => {
    const trimmed = value.trimStart();
    if (!trimmed.startsWith("/")) return [];
    const partial = trimmed.split(/\s/)[0].slice(1).toLowerCase();
    if (trimmed.includes(" ")) return [];
    if (!partial) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter((cmd) => cmd.name.startsWith(partial));
  }, [value]);

  const showMenu = slashMatches.length > 0 && !isRunning;

  const isSolveArgMode = useMemo(() => {
    const trimmed = value.trimStart().toLowerCase();
    return trimmed.startsWith("/solve ") && !isRunning;
  }, [value, isRunning]);

  const challengeQuery = useMemo(() => {
    if (!isSolveArgMode) return "";
    return value.trimStart().slice(7).replace(/^["']|["']$/g, "").trim().toLowerCase();
  }, [value, isSolveArgMode]);

  const filteredChallenges = useMemo(() => {
    if (!isSolveArgMode || challengeList.length === 0) return [];
    if (!challengeQuery) return challengeList;
    return challengeList.filter(
      (c) =>
        c.name.toLowerCase().includes(challengeQuery) ||
        c.category.toLowerCase().includes(challengeQuery),
    );
  }, [isSolveArgMode, challengeList, challengeQuery]);

  const showChallengeMenu = filteredChallenges.length > 0 && isSolveArgMode;

  useEffect(() => {
    if (!isSolveArgMode || !sessionId) return;
    if (challengeFetchedRef.current === sessionId) return;
    challengeFetchedRef.current = sessionId;
    getCtfChallenges(sessionId)
      .then((data) => setChallengeList(data.challenges || []))
      .catch(() => setChallengeList([]));
  }, [isSolveArgMode, sessionId]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [slashMatches.length]);

  useEffect(() => {
    setChallengeSelectedIndex(0);
  }, [filteredChallenges.length]);

  const acceptCommand = useCallback(
    (cmd) => {
      setValue(`/${cmd.name} `);
      textareaRef.current?.focus();
    },
    [],
  );

  const acceptChallenge = useCallback(
    (ch, send) => {
      const quoted = `/solve "${ch.name}" `;
      if (send) {
        setValue(`/solve "${ch.name}"`);
        setTimeout(() => {
          onSend(`/solve "${ch.name}"`);
          setValue("");
        }, 0);
      } else {
        setValue(quoted);
        textareaRef.current?.focus();
      }
    },
    [onSend],
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
      if (showChallengeMenu) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setChallengeSelectedIndex((prev) =>
            prev < filteredChallenges.length - 1 ? prev + 1 : 0,
          );
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setChallengeSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredChallenges.length - 1,
          );
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault();
          const ch = filteredChallenges[challengeSelectedIndex];
          if (ch) acceptChallenge(ch, false);
          return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          const ch = filteredChallenges[challengeSelectedIndex];
          if (ch) acceptChallenge(ch, true);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setValue("");
          return;
        }
      }

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
    [handleSend, showMenu, showChallengeMenu, slashMatches, selectedIndex, filteredChallenges, challengeSelectedIndex, acceptCommand, acceptChallenge, onSend],
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
      {burpAttachment && (
        <div className={styles.attachmentChip}>
          <div className={styles.attachmentIcon}>
            <TbRadar size={13} />
          </div>
          <div className={styles.attachmentInfo}>
            <span className={styles.attachmentMethod}>
              {burpAttachment.method}
            </span>
            <span className={styles.attachmentTarget}>
              {burpAttachment.host}{burpAttachment.path}
            </span>
            {burpAttachment.statusCode && (
              <span className={styles.attachmentStatus}>
                {burpAttachment.statusCode}
              </span>
            )}
          </div>
          <button
            className={styles.attachmentDismiss}
            onClick={onDismissBurpAttachment}
            title="Remove attachment"
          >
            <CloseOutlined style={{ fontSize: "0.6rem" }} />
          </button>
        </div>
      )}

      {showChallengeMenu && (
        <div className={styles.slashMenu} ref={menuRef}>
          <div className={styles.slashMenuHeader}>Challenges</div>
          {filteredChallenges.map((ch, i) => (
            <div
              key={ch.safeDir}
              className={`${styles.slashMenuItem} ${i === challengeSelectedIndex ? styles.slashMenuItemActive : ""}`}
              onMouseEnter={() => setChallengeSelectedIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                acceptChallenge(ch, true);
              }}
            >
              <span className={styles.slashMenuCmd}>{ch.name}</span>
              <span className={styles.slashMenuDesc}>{ch.category} &middot; {ch.value} pts</span>
            </div>
          ))}
        </div>
      )}

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
              : burpAttachment
                ? "Add instructions for this request, or press Enter to analyze..."
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
