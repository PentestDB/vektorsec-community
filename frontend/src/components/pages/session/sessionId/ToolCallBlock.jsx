import React, { useState } from "react";
import styles from "@/styles/components/Chat.module.scss";
import { CaretRightOutlined, LoadingOutlined } from "@ant-design/icons";

const TOOL_LABELS = {
  run_bash: "Bash",
  run_python_script: "Python Script",
  run_install_tool: "Install Tool",
  google_search: "Google Search",
  msfvenom_payload: "MSFVenom",
  netcat_listener: "Netcat Listener",
  ask_user: "Question",
};

function formatArgs(toolName, args) {
  if (!args) return "";
  if (typeof args === "string") {
    try { args = JSON.parse(args); } catch { return args; }
  }
  if (toolName === "run_bash") return args.command ?? "";
  if (toolName === "run_python_script") return args.file_name ?? "";
  if (toolName === "google_search") return args.query ?? "";
  if (toolName === "run_install_tool") return args.command ?? "";
  if (toolName === "ask_user") return args.question ?? "";
  return JSON.stringify(args);
}

export default function ToolCallBlock({ message }) {
  const [expanded, setExpanded] = useState(false);

  const { toolName, args, content, streaming, exitCode } = message;

  const label = TOOL_LABELS[toolName] ?? toolName;
  const argsPreview = formatArgs(toolName, args);

  const isRunning = streaming;
  const isError = exitCode != null && exitCode !== 0;
  const isSuccess = exitCode != null && exitCode === 0;

  return (
    <div className={styles.toolCallBlock}>
      <div
        className={styles.toolCallHeader}
        onClick={() => setExpanded(!expanded)}
      >
        <span
          className={`${styles.toolCallIcon} ${expanded ? styles.toolCallIconOpen : ""}`}
        >
          <CaretRightOutlined />
        </span>
        <span className={styles.toolCallName}>{label}</span>
        <span className={styles.toolCallArgs} title={argsPreview}>
          {argsPreview}
        </span>
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
      {expanded && content && (
        <div className={styles.toolCallOutput}>
          <pre>{content}</pre>
        </div>
      )}
    </div>
  );
}
