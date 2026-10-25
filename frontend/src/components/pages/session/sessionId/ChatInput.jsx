import React, { useRef, useState, useCallback, useMemo, useEffect } from "react";
import styles from "@/styles/components/Chat.module.scss";
import { SendOutlined, PauseCircleOutlined, CloseOutlined, ReloadOutlined, PaperClipOutlined, FileOutlined } from "@ant-design/icons";
import { message } from "antd";
import { TbRadar } from "react-icons/tb";
import { useQuery } from "react-query";
import { getCtfChallenges } from "@/services/ctf.service";
import { getSessionInfo, uploadSessionAttachment } from "@/services/agent.service";
import { formatDurationSec } from "@/utils/formatDuration";
import { useFormatters, useTranslation } from "@/i18n/I18nProvider";

function challengeStatusBadge(ch) {
  const raw = (ch.status || "pending").toLowerCase();
  const map = {
    pending: { labelKey: "chat.challengePending", tone: "pending" },
    solving: { labelKey: "chat.challengeSolving", tone: "solving" },
    solved: { labelKey: "chat.challengeSolved", tone: "solved" },
    submitted: { labelKey: "chat.challengeSubmitted", tone: "submitted" },
  };
  return map[raw] || map.pending;
}

const SLASH_COMMANDS = [
  { name: "summarize", descriptionKey: "chat.slash.summarize" },
  { name: "status", descriptionKey: "chat.slash.status" },
  { name: "clear", descriptionKey: "chat.slash.clear" },
  { name: "help", descriptionKey: "chat.slash.help" },
  { name: "targets", descriptionKey: "chat.slash.targets" },
  { name: "export", descriptionKey: "chat.slash.export" },
  { name: "shells", descriptionKey: "chat.slash.shells" },
  { name: "reset", descriptionKey: "chat.slash.reset" },
  { name: "solve", descriptionKey: "chat.slash.solve" },
];

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024; // 50MB

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ChatInput({
  sessionId,
  onSend,
  onPause,
  onForceReset,
  agentState,
  disabled,
  burpAttachment,
  onDismissBurpAttachment,
}) {
  const [value, setValue] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { t } = useTranslation();
  const { formatNumber } = useFormatters();
  const textareaRef = useRef(null);
  const menuRef = useRef(null);
  const fileInputRef = useRef(null);
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);

  const { data: sessionInfo } = useQuery(
    ["session-info", sessionId],
    () => getSessionInfo(sessionId),
    { enabled: !!sessionId, staleTime: 60000 }
  );

  const [challengeList, setChallengeList] = useState([]);
  const [challengeSelectedIndex, setChallengeSelectedIndex] = useState(0);
  const solveMenuSessionRef = useRef(null);
  const autoSolvePopulatedRef = useRef(null);

  const isRunning = agentState === "running";
  const canSend =
    !isRunning &&
    !sending &&
    (value.trim().length > 0 || attachments.length > 0 || !!burpAttachment) &&
    !disabled;

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
    if (
      sessionInfo?.isCTF &&
      sessionInfo?.name &&
      sessionId &&
      autoSolvePopulatedRef.current !== sessionId
    ) {
      autoSolvePopulatedRef.current = sessionId;
      setValue(`/solve "${sessionInfo.name}" `);
    }
  }, [sessionId, sessionInfo?.isCTF, sessionInfo?.name]);

  useEffect(() => {
    if (!isSolveArgMode || !sessionId) {
      solveMenuSessionRef.current = null;
      return;
    }
    if (solveMenuSessionRef.current === sessionId) return;
    solveMenuSessionRef.current = sessionId;
    const scopeId = sessionInfo?.workspaceId || sessionId;
    getCtfChallenges(scopeId)
      .then((data) => setChallengeList(data.challenges || []))
      .catch(() => setChallengeList([]));
  }, [isSolveArgMode, sessionId, sessionInfo?.workspaceId]);

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

  const handleSend = useCallback(async () => {
    if (!canSend) return;
    const userText = value.trim();

    if (attachments.length === 0) {
      onSend(userText);
      setValue("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      return;
    }

    setSending(true);
    try {
      const uploaded = [];
      for (const att of attachments) {
        const formData = new FormData();
        formData.append("file", att.file);
        uploaded.push(await uploadSessionAttachment(sessionId, formData));
      }

      const blocks = uploaded.map((u) => {
        if (u.textPreview) {
          return `[Attached file: ${u.filename} (${formatBytes(u.size)}, ${u.mimeType})]\n--- FILE CONTENT ---\n${u.textPreview}\n--- END FILE CONTENT ---`;
        }
        return `[Attached file: ${u.filename} (${formatBytes(u.size)}, ${u.mimeType}) — no text preview available. The file was stored server-side with id ${u.attachmentId}.]`;
      });

      const parts = [userText];
      if (!userText) parts.push("Please analyze the attached file(s) below.");
      parts.push(...blocks);
      const finalMessage = parts.filter(Boolean).join("\n\n");

      onSend(finalMessage, {
        fileAttachments: uploaded.map((u) => ({
          name: u.filename,
          size: u.size,
          mimeType: u.mimeType,
          textPreview: u.textPreview,
        })),
        displayText: userText,
      });

      setValue("");
      setAttachments([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch (err) {
      const resData = err?.response?.data;
      if (
        err?.response?.status === 402 ||
        resData?.code === "PLAN_REQUIRES_PAYMENT"
      ) {
        message.error(t("chat.attachRequiresPayment"));
      } else {
        message.error(resData?.message ?? t("chat.attachFailed"));
      }
    } finally {
      setSending(false);
    }
  }, [canSend, value, attachments, sessionId, onSend, t]);

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

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e) => {
      const selected = Array.from(e.target.files || []);
      e.target.value = "";
      if (!selected.length) return;
      setAttachments((prev) => {
        const next = [...prev];
        for (const file of selected) {
          if (next.length >= MAX_ATTACHMENTS) {
            message.warning(t("chat.maxFiles", { max: MAX_ATTACHMENTS }));
            break;
          }
          if (file.size > MAX_ATTACHMENT_BYTES) {
            message.error(t("chat.fileTooLarge", { name: file.name }));
            continue;
          }
          if (
            next.some(
              (a) => a.file.name === file.name && a.file.size === file.size,
            )
          ) {
            continue;
          }
          next.push({
            id: `${file.name}-${file.size}-${Date.now()}-${next.length}`,
            file,
          });
        }
        return next;
      });
    },
    [t],
  );

  const removeAttachment = useCallback((id) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const statusLabel =
    agentState === "running"
      ? t("chat.statusWorking")
      : agentState === "paused"
        ? t("chat.statusPaused")
        : agentState === "waiting_consent"
          ? t("chat.statusWaitingConsent")
          : agentState === "waiting_manual_execution"
            ? t("chat.statusWaitingManual")
            : t("chat.statusReady");

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
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className={styles.hiddenFileInput}
        onChange={handleFileChange}
        tabIndex={-1}
        aria-hidden="true"
      />
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
            title={t("chat.removeAttachmentTitle")}
          >
            <CloseOutlined style={{ fontSize: "0.6rem" }} />
          </button>
        </div>
      )}

      {attachments.length > 0 && (
        <div className={styles.fileChipList}>
          {attachments.map((att) => (
            <div key={att.id} className={styles.attachmentChip}>
              <div className={styles.attachmentIcon}>
                <FileOutlined style={{ fontSize: "0.75rem" }} />
              </div>
              <div className={styles.attachmentInfo}>
                <span className={styles.attachmentTarget}>{att.file.name}</span>
                <span className={styles.attachmentStatus}>
                  {formatBytes(att.file.size)}
                </span>
              </div>
              <button
                className={styles.attachmentDismiss}
                onClick={() => removeAttachment(att.id)}
                title={t("chat.removeAttachmentTitle")}
                disabled={sending}
              >
                <CloseOutlined style={{ fontSize: "0.6rem" }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showChallengeMenu && (
        <div className={styles.slashMenu} ref={menuRef}>
          <div className={styles.slashMenuHeader}>{t("chat.challenges")}</div>
          {filteredChallenges.map((ch, i) => {
            const st = challengeStatusBadge(ch);
            return (
              <div
                key={ch.safeDir}
                className={`${styles.slashMenuItem} ${styles.slashMenuItemChallenge} ${i === challengeSelectedIndex ? styles.slashMenuItemActive : ""}`}
                onMouseEnter={() => setChallengeSelectedIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  acceptChallenge(ch, true);
                }}
              >
                <div className={styles.slashChallengeInner}>
                  <div className={styles.slashChallengeTitleRow}>
                    <span className={styles.slashMenuCmd}>{ch.name}</span>
                    <span
                      className={`${styles.challengeStatusPill} ${styles[`challengeStatus_${st.tone}`]}`}
                    >
                      {t(st.labelKey)}
                    </span>
                  </div>
                  <span className={styles.slashMenuDesc}>
                    {ch.category} &middot;{" "}
                    {t("chat.challengePoints", { value: formatNumber(ch.value) })}
                    {ch.timeToSolveSec != null &&
                      (ch.status === "solved" || ch.status === "submitted") && (
                        <>
                          {" "}
                          &middot;{" "}
                          {t("chat.challengeTimeToFlag", {
                            duration: formatDurationSec(ch.timeToSolveSec),
                          })}
                        </>
                      )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showMenu && (
        <div className={styles.slashMenu} ref={menuRef}>
          <div className={styles.slashMenuHeader}>{t("chat.commands")}</div>
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
              <span className={styles.slashMenuDesc}>{t(cmd.descriptionKey)}</span>
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
              ? t("chat.placeholderWorking")
              : burpAttachment
                ? t("chat.placeholderAttachment")
                : t("chat.placeholderDefault")
          }
          rows={1}
          disabled={isRunning}
        />
        <div className={styles.inputActions}>
          {isRunning ? (
            <>
              <button
                className={styles.pauseButton}
                onClick={onForceReset}
                title={t("chat.forceResetTitle")}
              >
                <ReloadOutlined />
              </button>
              <button
                className={styles.pauseButton}
                onClick={onPause}
                title={t("chat.pauseTitle")}
              >
                <PauseCircleOutlined />
              </button>
            </>
          ) : (
            <>
              <button
                className={styles.attachButton}
                onClick={openFilePicker}
                disabled={sending || disabled}
                title={t("chat.attachFileTitle")}
              >
                <PaperClipOutlined />
              </button>
              <button
                className={styles.sendButton}
                onClick={handleSend}
                disabled={!canSend}
                title={t("chat.sendTitle")}
              >
                <SendOutlined />
              </button>
            </>
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
