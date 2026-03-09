import React from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import styles from "@/styles/components/Chat.module.scss";

const CONSENT_CONFIG = {
  run_install_tool: {
    title: "Tool installation requires approval",
    getCode: (args) => args?.command ?? "",
    language: "bash",
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

  return (
    <div className={styles.consentBanner}>
      <div className={styles.consentInfo}>
        <div className={styles.consentTitle}>{config.title}</div>
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
      <div className={styles.consentActions}>
        <button className={styles.consentApproveBtn} onClick={onApprove}>
          Approve
        </button>
        <button className={styles.consentDenyBtn} onClick={onDeny}>
          Deny
        </button>
      </div>
    </div>
  );
}
