import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import styles from "@/styles/components/Chat.module.scss";
import {
  CaretRightOutlined,
  LoadingOutlined,
  CopyOutlined,
  CheckOutlined,
} from "@ant-design/icons";
import { useTranslation } from "@/i18n/I18nProvider";
import { SCOPE_GUARD_LOCKED, SECURITY_CONTACT_URL } from "@/constants/security";

const TOOL_LABELS = {
  run_bash: "Bash",
  run_python_script: "Python Script",
  run_install_tool: "Install Tool",
  google_search: "Google Search",
  ask_user: "Question",
  spawn_shell: "Spawn Shell",
  write_to_shell: "Write to Shell",
  read_shell: "Read Shell",
  list_shells: "List Shells",
  close_shell: "Close Shell",
  spawn_subagent: "Spawn Subagent",
  view_image: "View Image",
  send_to_burp: "Burp Request",
  search_caido_http_history: "Caido History",
  send_to_caido_replay: "Caido Replay",
  send_to_caido_automate: "Caido Automate",
  caido_intercept_control: "Caido Intercept",
  caido_oast: "Caido OAST",
  mythic_callbacks: "Mythic Callbacks",
  mythic_task: "Mythic Task",
  mythic_task_results: "Mythic Task Output",
  mythic_pivot: "Mythic Pivot",
  mythic_payload: "Mythic Payload",
  mythic_listener: "Mythic Listener",
  mythic_loot: "Mythic Loot",
  mythic_graphql: "Mythic GraphQL",
  platform_health: "MCP Platform Health",
  platform_setup: "MCP Platform Setup",
  platform_repair: "MCP Platform Repair",
  engagement_open: "MCP Engagement Open",
  engagement_status: "MCP Engagement Status",
  engagement_update: "MCP Engagement Update",
  engagement_pause: "MCP Engagement Pause",
  engagement_history: "MCP Engagement History",
  agent_message: "MCP Agent Message",
  shell_exec: "MCP Shell Exec",
  shell_session: "MCP Shell Session",
  burp: "MCP Burp",
  caido: "MCP Caido",
  browser_run: "MCP Browser",
  vpn_manage: "MCP VPN",
  findings_manage: "MCP Findings",
  artifact_add: "MCP Artifact Add",
  browser_observation_add: "MCP Browser Observation",
  artifact_get: "MCP Artifact Get",
};

function parseArgs(args) {
  if (!args) return {};
  if (typeof args === "string") {
    try {
      return JSON.parse(args);
    } catch {
      return {};
    }
  }
  return args;
}

function formatArgsPreview(toolName, parsed) {
  if (toolName === "run_bash") return parsed.command ?? "";
  if (toolName === "run_python_script")
    return parsed.file_name ?? "inline script";
  if (toolName === "google_search") return parsed.query ?? "";
  if (toolName === "run_install_tool") return parsed.tool_name ?? "";
  if (toolName === "ask_user") return parsed.question ?? "";
  if (toolName === "spawn_shell") return parsed.label ?? "";
  if (toolName === "write_to_shell")
    return `[${parsed.shell_id}] ${(parsed.input ?? "").slice(0, 60)}`;
  if (toolName === "read_shell") return `[${parsed.shell_id}]`;
  if (toolName === "close_shell") return `[${parsed.shell_id}]`;
  if (toolName === "spawn_subagent") return (parsed.task ?? "").slice(0, 80);
  if (toolName === "view_image") return parsed.image_path ?? "";
  if (toolName === "send_to_burp") {
    const req = parsed.raw_request ?? "";
    const firstLine = req.split(/\r?\n/)[0] || "";
    const method = firstLine.split(" ")[0] || "";
    const path = firstLine.split(" ")[1] || "";
    return `${method} ${parsed.host ?? ""}${path ? `:${parsed.port ?? 443}${path}` : ""}`;
  }
  if (toolName === "mythic_task_results") {
    return `${parsed.action ?? ""} ${parsed.task_display_id != null ? `task ${parsed.task_display_id}` : ""}`.trim();
  }
  if (toolName === "mythic_task") {
    const target = parsed.callback_display_id != null ? `callback ${parsed.callback_display_id}` : "";
    return `${target}: ${parsed.command ?? ""} ${parsed.params ?? ""}`.trim();
  }
  if (toolName === "mythic_pivot") {
    return `${parsed.action ?? ""} ${parsed.callback_display_id != null ? `callback ${parsed.callback_display_id}` : ""}${parsed.port ? ` :${parsed.port}` : ""}`.trim();
  }
  if (toolName === "mythic_callbacks") {
    return `${parsed.action ?? ""} ${parsed.callback_display_id != null ? `callback ${parsed.callback_display_id}` : ""}`.trim();
  }
  if (toolName === "mythic_payload" || toolName === "mythic_listener") {
    return `${parsed.action ?? ""} ${parsed.profile_name ?? parsed.save_path ?? ""}`.trim();
  }
  if (toolName === "mythic_loot") {
    return `${parsed.action ?? ""} ${parsed.remote_path ?? parsed.local_path ?? parsed.save_path ?? parsed.account ?? parsed.host ?? ""}`.trim();
  }
  if (toolName === "mythic_graphql") return (parsed.query ?? "").slice(0, 80);
  if (toolName === "agent_message") return (parsed.message ?? "").slice(0, 80);
  if (toolName === "shell_exec") return parsed.command ?? "";
  if (toolName === "shell_session")
    return `${parsed.action ?? ""} ${parsed.shell_id ?? parsed.label ?? ""}`;
  if (toolName === "browser_run")
    return `${parsed.url ?? ""} ${(parsed.goal ?? "").slice(0, 60)}`;
  if (toolName === "burp") return parsed.action ?? "";
  if (toolName === "vpn_manage")
    return `${parsed.action ?? ""} ${parsed.profile_name ?? ""}`;
  if (toolName === "findings_manage")
    return `${parsed.action ?? ""} ${parsed.title ?? parsed.finding_id ?? ""}`;
  if (toolName === "artifact_add")
    return `${parsed.type ?? ""} ${parsed.title ?? ""}`;
  if (toolName === "browser_observation_add") return parsed.url ?? "";
  if (toolName === "artifact_get")
    return `${parsed.action ?? ""} ${parsed.path ?? ""}`;
  if (toolName?.startsWith("engagement_"))
    return parsed.engagement_id ?? parsed.name ?? "";
  if (toolName?.startsWith("platform_")) return parsed.component ?? "";
  return JSON.stringify(parsed);
}

function getCodePreview(toolName, parsed) {
  if (toolName === "run_bash") {
    return { code: parsed.command ?? "", language: "bash" };
  }
  if (toolName === "run_install_tool") {
    return null;
  }
  if (toolName === "run_python_script") {
    return { code: parsed.script ?? "", language: "python" };
  }
  if (toolName === "send_to_burp") {
    return { code: parsed.raw_request ?? "", language: "http" };
  }
  if (toolName === "shell_exec") {
    return { code: parsed.command ?? "", language: "bash" };
  }
  if (toolName === "mythic_task" && parsed.command) {
    return {
      code: `${parsed.command} ${parsed.params ?? ""}`.trim(),
      language: "bash",
    };
  }
  if (toolName === "mythic_graphql") {
    return { code: parsed.query ?? "", language: "graphql" };
  }
  if (toolName === "mythic_payload" && parsed.definition) {
    return { code: parsed.definition, language: "json" };
  }
  return null;
}

const highlighterCustomStyle = {
  margin: 0,
  borderRadius: "0",
  fontSize: "0.78rem",
  background: "transparent",
  padding: "0.6rem 0.75rem",
};

/**
 * Detect guardrail outcomes in a tool result so the transcript can explain *why*
 * an action did not run: workspace scope allowlist, SSRF guard, or the safety
 * protection for destructive commands.
 *
 * Handlers return these markers as plain text (see
 * `backend/src/tools/handlers/scan-guard.ts` and `utils/guardrails.ts`), so the
 * check is intentionally text-based and defensive.
 *
 * Returns `{ tone, detail }` — `tone` is one of `"ssrf" | "blocked" | "warning"`;
 * `detail` is the backend-provided reason (empty when the backend only emitted
 * the marker). Titles/fallback copy are added by the component through i18n, so
 * this function stays pure and testable.
 */
export function detectGuardrailNotice(content) {
  if (!content) return null;
  const text = String(content);
  const detail =
    text
      .split(/\r?\n/)
      .find((line) => /BLOCKED|OUT OF SCOPE|safety/i.test(line))
      ?.replace(/^BLOCKED:\s*/i, "")
      .trim() || "";

  // SSRF protection owns its own copy: the remedy (turn SSRF protection off
  // under Admin > Security) is different from a workspace scope violation.
  // Backend marker: "BLOCKED: Target IP/Domain is restricted for security reasons."
  // (see backend/src/utils/ssrfGuard.ts → blockedTargetResult).
  if (/Target IP\/Domain is restricted for security reasons/i.test(text)) {
    return { tone: "ssrf", detail };
  }

  if (/^\s*BLOCKED:/im.test(text) || /\bOUT OF SCOPE\b/i.test(text)) {
    return { tone: "blocked", detail };
  }

  if (/^\s*WARNING:/im.test(text) && /out of scope/i.test(text)) {
    return { tone: "warning", detail };
  }

  return null;
}

const ToolCallBlock = React.memo(function ToolCallBlock({ message }) {
  const [codeCollapsed, setCodeCollapsed] = useState(false);
  const [outputCollapsed, setOutputCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const outputRef = useRef(null);
  const { t } = useTranslation();

  const { toolName, args, content, streaming, exitCode } = message;

  const label = TOOL_LABELS[toolName] ?? toolName;
  const parsed = useMemo(() => parseArgs(args), [args]);
  const argsPreview = formatArgsPreview(toolName, parsed);
  const codePreview = useMemo(
    () => getCodePreview(toolName, parsed),
    [toolName, parsed],
  );

  const isRunning = streaming;
  const isError = exitCode != null && exitCode !== 0;
  const isSuccess = exitCode != null && exitCode === 0;
  const hasContent = content && content.length > 0;
  const hasCode = codePreview && codePreview.code;
  // Guardrail notices are localised: the backend supplies the raw reason when it
  // has one, otherwise we fall back to the translated explanation.
  const guardrail = useMemo(() => {
    const notice = detectGuardrailNotice(content);
    if (!notice) return null;
    const prefix =
      notice.tone === "ssrf"
        ? "guardrails.ssrf"
        : notice.tone === "blocked"
          ? "guardrails.blocked"
          : "guardrails.warning";
    return {
      tone: notice.tone,
      title: t(`${prefix}Title`),
      detail: notice.detail || t(`${prefix}Detail`),
    };
  }, [content, t]);

  useEffect(() => {
    if (streaming && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [content, streaming]);

  const copyText = useCallback((text) => {
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(text);
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
      return Promise.resolve();
    } finally {
      document.body.removeChild(textarea);
    }
  }, []);

  const handleCopy = useCallback(
    (e) => {
      e.stopPropagation();
      const textToCopy = hasCode ? codePreview.code : argsPreview;
      if (!textToCopy) return;
      copyText(textToCopy)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
        .catch(() => {});
    },
    [argsPreview, hasCode, codePreview, copyText],
  );

  const displayContent = hasContent
    ? content.length > 8000
      ? "..." + content.slice(-8000)
      : content
    : null;

  return (
    <div className={styles.toolCallBlock}>
      <div
        className={styles.toolCallHeader}
        onClick={() => {
          if (hasCode) setCodeCollapsed(!codeCollapsed);
          else if (hasContent) setOutputCollapsed(!outputCollapsed);
        }}
      >
        {(hasContent || hasCode) && (
          <span
            className={`${styles.toolCallIcon} ${(hasCode ? !codeCollapsed : !outputCollapsed) ? styles.toolCallIconOpen : ""}`}
          >
            <CaretRightOutlined />
          </span>
        )}
        <span className={styles.toolCallName}>{label}</span>
        <span className={styles.toolCallArgs} title={argsPreview}>
          {argsPreview}
        </span>
        {(argsPreview || hasCode) && (
          <button
            className={`${styles.toolCallCopyBtn} ${copied ? styles.copied : ""}`}
            onClick={handleCopy}
            title={copied ? "Copied!" : "Copy code"}
          >
            {copied ? <CheckOutlined /> : <CopyOutlined />}
          </button>
        )}
        <span
          className={`${styles.toolCallStatus} ${
            isRunning
              ? styles.toolCallRunning
              : isError
                ? styles.toolCallError
                : isSuccess
                  ? styles.toolCallSuccess
                  : ""
          }`}
        >
          {isRunning ? (
            <>
              <LoadingOutlined spin /> Running
            </>
          ) : isError ? (
            `Exit ${exitCode}`
          ) : isSuccess ? (
            "Done"
          ) : (
            ""
          )}
        </span>
      </div>

      {guardrail && (
        <div
          className={`${styles.guardrailNotice} ${
            guardrail.tone === "warning" ? styles.guardrailWarning : styles.guardrailBlocked
          }`}
        >
          <strong>{guardrail.title}</strong>
          <span>{guardrail.detail}</span>
          {SCOPE_GUARD_LOCKED && guardrail.tone === "blocked" && (
            <span className={styles.guardrailContact}>
              {t("guardrails.guardLocked")}{" "}
              <a href={SECURITY_CONTACT_URL} target="_blank" rel="noopener noreferrer">
                {t("guardrails.guardContact")} {SECURITY_CONTACT_URL}
              </a>
            </span>
          )}
        </div>
      )}

      {hasCode && !codeCollapsed && (
        <div className={styles.toolCallCodePreview}>
          <SyntaxHighlighter
            language={codePreview.language}
            style={oneDark}
            customStyle={highlighterCustomStyle}
            wrapLongLines
            codeTagProps={{ style: {} }}
          >
            {codePreview.code}
          </SyntaxHighlighter>
        </div>
      )}

      {displayContent && (
        <div
          className={`${styles.toolCallOutputSection} ${outputCollapsed ? styles.outputCollapsed : ""}`}
        >
          <div
            className={styles.toolCallOutputHeader}
            onClick={(e) => {
              e.stopPropagation();
              setOutputCollapsed(!outputCollapsed);
            }}
          >
            <span
              className={`${styles.toolCallIcon} ${!outputCollapsed ? styles.toolCallIconOpen : ""}`}
            >
              <CaretRightOutlined />
            </span>
            Output
          </div>
          {!outputCollapsed && (
            <div className={styles.toolCallOutput} ref={outputRef}>
              <pre>{displayContent}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default ToolCallBlock;
