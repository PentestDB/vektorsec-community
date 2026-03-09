import React from "react";
import { CheckOutlined, CloseOutlined, ExclamationCircleOutlined } from "@ant-design/icons";
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
};

const DEFAULT_CONFIG = {
  title: "Tool execution requires approval",
  getCode: (args) => (args?.command ?? JSON.stringify(args, null, 2)),
  language: "text",
};

function getConsentSummary(toolName) {
  if (toolName === "run_bash") return "Review command";
  if (toolName === "run_python_script") return "Review script";
  if (toolName === "run_install_tool") return "Review install";
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
  const { toolName, args } = pendingConsent;
  const config = CONSENT_CONFIG[toolName] ?? DEFAULT_CONFIG;
  const code = config.getCode(args);
  const summary = getConsentSummary(toolName);

  return (
    <div className={styles.consentBanner}>
      <div className={styles.consentInfo}>
        <div className={styles.consentHeader}>
          <div className={styles.consentBadge}>
            <ExclamationCircleOutlined />
            <span>Approval</span>
          </div>
          <div className={styles.consentTitleGroup}>
            <div className={styles.consentTitle}>{config.title}</div>
            <div className={styles.consentSubtitle}>{summary}</div>
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
        {code && (
          <div className={styles.consentCodePreview}>
            <SyntaxHighlighter
              language={config.language}
              style={oneDark}
              customStyle={highlighterCustomStyle}
              wrapLongLines
            >
              {code}
            </SyntaxHighlighter>
          </div>
        )}
      </div>
    </div>
  );
}
