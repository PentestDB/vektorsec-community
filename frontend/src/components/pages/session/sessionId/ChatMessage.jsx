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

function findToolOutput(toolCallId, allMessages) {
  if (!toolCallId || !allMessages) return null;
  return allMessages.find(
    (m) => m.role === "tool" && m.toolCallId === toolCallId,
  );
}

const ChatMessage = React.memo(function ChatMessage({ message, allMessages }) {
  const { role, content, streaming, isError, isSummary, toolCalls } = message;

  if (role === "tool") {
    const hasPairedAssistant = allMessages?.some(
      (m) =>
        m.role === "assistant" &&
        m.toolCalls?.some((tc) => tc.id === message.toolCallId),
    );
    if (hasPairedAssistant) return null;

    let enrichedMessage = message;
    if (!message.args && message.toolCallId && allMessages) {
      const assistantMsg = [...allMessages].reverse().find(
        (m) =>
          m.role === "assistant" &&
          m.toolCalls?.some((tc) => tc.id === message.toolCallId),
      );
      if (assistantMsg) {
        const tc = assistantMsg.toolCalls.find(
          (tc) => tc.id === message.toolCallId,
        );
        if (tc) {
          enrichedMessage = { ...message, args: tc.arguments };
        }
      }
    }
    return <ToolCallBlock message={enrichedMessage} />;
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
        {toolCalls?.map((tc) => {
          const toolOutput = findToolOutput(tc.id, allMessages);
          const toolMsg = toolOutput
            ? {
                ...toolOutput,
                toolName: toolOutput.toolName || tc.name,
                args: toolOutput.args || tc.arguments,
              }
            : {
                id: `inline_${tc.id}`,
                role: "tool",
                toolCallId: tc.id,
                toolName: tc.name,
                args: tc.arguments,
                content: "",
                streaming: false,
              };
          return <ToolCallBlock key={tc.id} message={toolMsg} />;
        })}
      </div>
    );
  }

  return null;
});

export default ChatMessage;
