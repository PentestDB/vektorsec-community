import React from "react";
import styles from "@/styles/components/Chat.module.scss";
import ToolCallBlock from "./ToolCallBlock";

function renderMarkdown(text) {
  if (!text) return null;

  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith("```")) {
      const match = part.match(/```(\w*)\n?([\s\S]*?)```/);
      const code = match ? match[2] : part.slice(3, -3);
      return (
        <pre key={i}>
          <code>{code.trim()}</code>
        </pre>
      );
    }

    const lines = part.split("\n").map((line, j) => {
      const boldLine = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
      const codeLine = boldLine.replace(/`([^`]+)`/g, "<code>$1</code>");
      return (
        <span key={j}>
          {j > 0 && <br />}
          <span dangerouslySetInnerHTML={{ __html: codeLine }} />
        </span>
      );
    });

    return <span key={i}>{lines}</span>;
  });
}

export default function ChatMessage({ message }) {
  const { role, content, streaming, isError, isSummary, toolCalls } = message;

  if (role === "tool") {
    return <ToolCallBlock message={message} />;
  }

  if (role === "system") {
    if (!isSummary && !isError) return null;
    return (
      <div
        className={`${styles.systemMessage} ${isError ? styles.errorMessage : ""}`}
      >
        {isSummary ? "/summarize " : ""}
        {content}
      </div>
    );
  }

  if (role === "user") {
    return (
      <div className={styles.message}>
        <div className={styles.userMessage}>{content}</div>
      </div>
    );
  }

  if (role === "assistant") {
    return (
      <div className={styles.message}>
        {content && (
          <div
            className={`${styles.assistantMessage} ${streaming ? styles.streamingCursor : ""}`}
          >
            {renderMarkdown(content)}
          </div>
        )}
        {toolCalls?.map((tc, i) => (
          <div key={tc.id || i} className={styles.toolCallBlock}>
            <div className={styles.toolCallHeader}>
              <span className={styles.toolCallName}>
                {tc.name}
              </span>
              <span className={styles.toolCallArgs}>
                {typeof tc.arguments === "string"
                  ? (() => {
                      try {
                        const parsed = JSON.parse(tc.arguments);
                        return parsed.command ?? parsed.query ?? parsed.question ?? tc.arguments;
                      } catch {
                        return tc.arguments;
                      }
                    })()
                  : ""}
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return null;
}
