import React from "react";
import { CheckOutlined, CloseOutlined, ExclamationCircleOutlined, WarningOutlined } from "@ant-design/icons";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import styles from "@/styles/components/Chat.module.scss";
import { useTranslation } from "@/i18n/I18nProvider";

const CONSENT_CONFIG = {
  run_install_tool: {
    titleKey: "chat.consent.titleInstall",
    getCode: (args) => args?.tool_name ? `Install: ${args.tool_name}` : "",
    language: "text",
  },
  run_bash: {
    titleKey: "chat.consent.titleRunBash",
    getCode: (args) => args?.command ?? "",
    language: "bash",
  },
  run_python_script: {
    titleKey: "chat.consent.titleRunPython",
    getCode: (args) => args?.script ?? "",
    language: "python",
  },
  write_to_shell: {
    titleKey: "chat.consent.titleWriteShell",
    getCode: (args) => args?.input ?? "",
    language: "bash",
  },
  mythic_task: {
    titleKey: "chat.consent.titleMythicTask",
    getCode: (args) => {
      const target =
        args?.callback_display_id != null
          ? `# target: Mythic callback ${args.callback_display_id}`
          : "";
      const command = `${args?.command ?? ""} ${args?.params ?? ""}`.trim();
      return [target, command].filter(Boolean).join("\n");
    },
    language: "bash",
  },
  mythic_pivot: {
    titleKey: "chat.consent.titleMythicPivot",
    getCode: (args) =>
      [
        `# ${args?.action ?? "pivot"} on Mythic callback ${args?.callback_display_id ?? "?"}`,
        args?.port ? `port: ${args.port}` : "",
        args?.remote_ip ? `forward to: ${args.remote_ip}:${args.remote_port ?? "?"}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    language: "bash",
  },
  mythic_payload: {
    titleKey: "chat.consent.titleMythicPayload",
    getCode: (args) =>
      args?.definition ?? `${args?.action ?? ""} ${args?.save_path ?? args?.agent_file_id ?? ""}`.trim(),
    language: "json",
  },
  mythic_listener: {
    titleKey: "chat.consent.titleMythicListener",
    getCode: (args) => `${args?.action ?? ""} ${args?.profile_name ?? ""}`.trim(),
    language: "text",
  },
  mythic_loot: {
    titleKey: "chat.consent.titleMythicLoot",
    getCode: (args) =>
      [
        `# Mythic callback ${args?.callback_display_id ?? "?"}`,
        `${args?.local_path ?? "?"} → ${args?.remote_path ?? "?"}`,
      ].join("\n"),
    language: "bash",
  },
  mythic_graphql: {
    titleKey: "chat.consent.titleMythicGraphql",
    getCode: (args) => args?.query ?? "",
    language: "graphql",
  },
};

const DEFAULT_CONFIG = {
  titleKey: "chat.consent.titleDefault",
  getCode: (args) => (args?.command ?? JSON.stringify(args, null, 2)),
  language: "text",
};

function getConsentSummary(t, toolName, safetyBlock) {
  if (safetyBlock) return t("chat.consent.blockedBySafety");
  if (toolName === "run_bash") return t("chat.consent.reviewCommand");
  if (toolName === "run_python_script") return t("chat.consent.reviewScript");
  if (toolName === "run_install_tool") return t("chat.consent.reviewInstall");
  if (toolName === "write_to_shell") return t("chat.consent.reviewShellInput");
  if (toolName === "mythic_task") return t("chat.consent.reviewC2Tasking");
  if (toolName === "mythic_pivot") return t("chat.consent.reviewNetworkPivot");
  if (toolName === "mythic_loot") return t("chat.consent.reviewFileWrite");
  if (toolName?.startsWith("mythic_")) return t("chat.consent.reviewC2Action");
  return t("chat.consent.reviewAction");
}

const highlighterCustomStyle = {
  margin: 0,
  borderRadius: "6px",
  fontSize: "0.78rem",
  background: "rgba(0, 0, 0, 0.4)",
  maxHeight: "300px",
};

export default function ConsentBanner({ pendingConsent, onApprove, onDeny }) {
  const { t } = useTranslation();
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
  const summary = getConsentSummary(t, toolName, safetyBlock);

  const bannerClassName = hasSafetyBlock
    ? `${styles.consentBanner} ${styles.consentBannerDanger}`
    : styles.consentBanner;

  const BadgeIcon = hasSafetyBlock ? WarningOutlined : ExclamationCircleOutlined;
  const badgeLabel = t(hasSafetyBlock ? "chat.consent.badgeSafetyBlock" : "chat.consent.badgeApproval");

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
                ? t("chat.consent.titleBatch", { count: actions.length })
                : hasSafetyBlock
                  ? t("chat.consent.titleBlockedDestructive")
                  : t(config.titleKey)}
            </div>
            <div className={styles.consentSubtitle}>
              {actions.length > 1
                ? t("chat.consent.subtitleBatch")
                : approvalReason || summary}
            </div>
          </div>
          <div className={styles.consentActions}>
            <button
              className={styles.consentApproveBtn}
              onClick={onApprove}
              title={t("chat.consent.approve")}
              aria-label={t("chat.consent.approve")}
            >
              <CheckOutlined />
            </button>
            <button
              className={styles.consentDenyBtn}
              onClick={onDeny}
              title={t("chat.consent.deny")}
              aria-label={t("chat.consent.deny")}
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
