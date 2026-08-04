import React from "react";
import { CheckOutlined, CloseOutlined, ExclamationCircleOutlined, WarningOutlined } from "@ant-design/icons";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import styles from "@/styles/components/Chat.module.scss";

const CONSENT_CONFIG = {
  run_install_tool: {
    title: "Tool installation requires approval",
    getCode: (args) => args?.tool_name ? `Install: ${args.tool_name}` : "",
    language: "text",
  },
  run_bash: {
    title: "Command execution requires approval",
    getCode: (args) => args?.command ?? "",
    language: "bash",
  },
  run_python_script: {
    title: "Python script execution requires approval",
    getCode: (args) => args?.script ?? "",
    language: "python",
  },
  write_to_shell: {
    title: "Shell input requires approval",
    getCode: (args) => args?.input ?? "",
    language: "bash",
  },
};

const DEFAULT_CONFIG = {
  title: "Tool execution requires approval",
  getCode: (args) => (args?.command ?? JSON.stringify(args, null, 2)),
  language: "text",
};

function getConsentSummary(toolName, safetyBlock) {
  if (safetyBlock) return "Dangerous command blocked by safety system";
  if (toolName === "run_bash") return "Review command";
  if (toolName === "run_python_script") return "Review script";
  if (toolName === "run_install_tool") return "Review install";
  if (toolName === "write_to_shell") return "Review shell input";
  return "Review action";
}

const highlighterCustomStyle = {
  margin: 0,
  borderRadius: "6px",
  fontSize: "0.78rem",
  background: "rgba(0, 0, 0, 0.4)",
  maxHeight: "300px",
};

export default function ConsentBanner({ pendingConsent, onApprove, onDeny }) {
  const { toolName, safetyBlock, approvalReason } = pendingConsent;
  const args = pendingConsent.args ?? pendingConsent.arguments;
  const config = CONSENT_CONFIG[toolName] ?? DEFAULT_CONFIG;
  const actions = pendingConsent.batch?.length
    ? pendingConsent.batch.map((action) => ({
        ...action,
        args: action.args ?? action.arguments,
      }))
    : [{ toolName, args, safetyBlock, approvalReason }];
  const hasSafetyBlock = actions.some((action) => action.safetyBlock);
  const summary = getConsentSummary(toolName, safetyBlock);

  const bannerClassName = hasSafetyBlock
    ? `${styles.consentBanner} ${styles.consentBannerDanger}`
    : styles.consentBanner;

  const BadgeIcon = hasSafetyBlock ? WarningOutlined : ExclamationCircleOutlined;
  const badgeLabel = hasSafetyBlock ? "Safety Block" : "Approval";

  return (
    <div className={bannerClassName}>
      <div className={styles.consentInfo}>
        <div className={styles.consentHeader}>
          <div className={hasSafetyBlock ? styles.consentBadgeDanger : styles.consentBadge}>
            <BadgeIcon />
            <span>{badgeLabel}</span>
          </div>
          <div className={styles.consentTitleGroup}>
            <div className={styles.consentTitle}>
              {actions.length > 1
                ? `${actions.length} tool actions require approval`
                : hasSafetyBlock
                  ? "Potentially destructive command blocked"
                  : config.title}
            </div>
            <div className={styles.consentSubtitle}>
              {actions.length > 1
                ? "Approving will run every action listed below."
                : approvalReason || summary}
            </div>
          </div>
          <div className={styles.consentActions}>
            <button
              className={styles.consentApproveBtn}
              onClick={onApprove}
              title="Approve"
              aria-label="Approve"
            >
              <CheckOutlined />
            </button>
            <button
              className={styles.consentDenyBtn}
              onClick={onDeny}
              title="Deny"
              aria-label="Deny"
            >
              <CloseOutlined />
            </button>
          </div>
        </div>
        {actions.map((action, index) => {
          const actionConfig = CONSENT_CONFIG[action.toolName] ?? DEFAULT_CONFIG;
          const code = actionConfig.getCode(action.args);
          return (
            <div
              key={action.toolCallId ?? `${action.toolName}-${index}`}
              className={styles.consentCodePreview}
              style={{ marginTop: index === 0 ? 0 : "0.65rem" }}
            >
              {actions.length > 1 && (
                <div style={{ marginBottom: "0.4rem", color: "var(--primary-text)", fontSize: "0.75rem" }}>
                  <strong>{index + 1}. {action.toolName}</strong>
                  {action.approvalReason && <span> — {action.approvalReason}</span>}
                </div>
              )}
              {code && (
                <SyntaxHighlighter
                  language={actionConfig.language}
                  style={oneDark}
                  customStyle={highlighterCustomStyle}
                  wrapLongLines
                >
                  {code}
                </SyntaxHighlighter>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
