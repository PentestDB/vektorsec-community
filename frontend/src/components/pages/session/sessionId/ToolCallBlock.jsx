import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import styles from "@/styles/components/Chat.module.scss";
import { CaretRightOutlined, LoadingOutlined, CopyOutlined, CheckOutlined } from "@ant-design/icons";

const TOOL_LABELS = {
  run_bash: "Bash",
  run_python_script: "Python Script",
  run_install_tool: "Install Tool",
  google_search: "Google Search",
  msfvenom_payload: "MSFVenom",
  netcat_listener: "Netcat Listener",
  ask_user: "Question",
};

function parseArgs(args) {
  if (!args) return {};
  if (typeof args === "string") {
    try { return JSON.parse(args); } catch { return {}; }
  }
  return args;
}

function formatArgsPreview(toolName, parsed) {
  if (toolName === "run_bash") return parsed.command ?? "";
  if (toolName === "run_python_script") return parsed.file_name ?? "inline script";
  if (toolName === "google_search") return parsed.query ?? "";
  if (toolName === "run_install_tool") return parsed.command ?? "";
  if (toolName === "ask_user") return parsed.question ?? "";
  return JSON.stringify(parsed);
}

function getCodePreview(toolName, parsed) {
  if (toolName === "run_bash" || toolName === "run_install_tool") {
    return { code: parsed.command ?? "", language: "bash" };
  }
  if (toolName === "run_python_script") {
    return { code: parsed.script ?? "", language: "python" };
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

const ToolCallBlock = React.memo(function ToolCallBlock({ message }) {
  const [codeCollapsed, setCodeCollapsed] = useState(false);
  const [outputCollapsed, setOutputCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const outputRef = useRef(null);

  const { toolName, args, content, streaming, exitCode } = message;

  const label = TOOL_LABELS[toolName] ?? toolName;
  const parsed = useMemo(() => parseArgs(args), [args]);
  const argsPreview = formatArgsPreview(toolName, parsed);
  const codePreview = useMemo(() => getCodePreview(toolName, parsed), [toolName, parsed]);

  const isRunning = streaming;
  const isError = exitCode != null && exitCode !== 0;
  const isSuccess = exitCode != null && exitCode === 0;
  const hasContent = content && content.length > 0;
  const hasCode = codePreview && codePreview.code;

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

  const handleCopy = useCallback((e) => {
    e.stopPropagation();
    const textToCopy = hasCode ? codePreview.code : argsPreview;
    if (!textToCopy) return;
    copyText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }, [argsPreview, hasCode, codePreview, copyText]);

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
            <span className={`${styles.toolCallIcon} ${!outputCollapsed ? styles.toolCallIconOpen : ""}`}>
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
