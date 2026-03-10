import React, { useState, useEffect } from "react";
import { BulbOutlined, DownOutlined, RightOutlined } from "@ant-design/icons";
import { TbRadar } from "react-icons/tb";
import ReactMarkdown from "react-markdown";
import styles from "@/styles/components/Chat.module.scss";
import ToolCallBlock from "./ToolCallBlock";

function ReasoningBlock({ reasoning, isStreaming }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!isStreaming && reasoning) {
      setCollapsed(true);
    }
  }, [isStreaming]);

  if (!reasoning) return null;

  return (
    <div className={`${styles.reasoningBlock} ${isStreaming ? styles.reasoningStreaming : ""}`}>
      <div
        className={styles.reasoningHeader}
        onClick={() => setCollapsed(!collapsed)}
      >
        <BulbOutlined className={styles.reasoningIcon} />
        <span className={styles.reasoningLabel}>Reasoning</span>
        {isStreaming && <span className={styles.reasoningLive}>thinking...</span>}
        {!isStreaming && reasoning && (
          <span className={styles.reasoningMeta}>
            {reasoning.length.toLocaleString()} chars
          </span>
        )}
        <span className={styles.reasoningChevron}>
          {collapsed ? <RightOutlined /> : <DownOutlined />}
        </span>
      </div>
      {!collapsed && (
        <div className={styles.reasoningContent}>
          <pre>{reasoning}</pre>
        </div>
      )}
    </div>
  );
}

function detectBurpMeta(content) {
  if (!content) return null;
  const targetMatch = content.match(/Target:\s*(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(https?):\/\/([^/\s]+)(\/[^\n]*)?/);
  const hasRawRequest = content.includes("--- RAW REQUEST ---");
  if (!targetMatch || !hasRawRequest) return null;
  const method = targetMatch[1];
  const secure = targetMatch[2] === "https";
  const host = targetMatch[3];
  const path = targetMatch[4] || "/";
  const hostMatch = content.match(/Host:\s*([^\s|]+)\s*\|\s*Port:\s*(\d+)/);
  const port = hostMatch ? parseInt(hostMatch[2], 10) : (secure ? 443 : 80);
  return { method, host, path, port, secure, statusCode: null };
}

function BurpRequestBlock({ content, meta }) {
  const [collapsed, setCollapsed] = useState(true);
  const scheme = meta.secure ? "https" : "http";
  const target = `${scheme}://${meta.host}${meta.path}`;
  const parts = content.split(/\n\n(?=(?:Target:|Analyze and pentest the following HTTP request))/);
  const firstPart = parts[0]?.trim();
  const hasInstruction = firstPart && !firstPart.startsWith("Analyze and pentest") && !firstPart.startsWith("Target:");
  const userInstruction = hasInstruction ? firstPart : null;

  return (
    <div className={styles.message}>
      {hasInstruction && (
        <div className={styles.userMessage}>{userInstruction}</div>
      )}
      <div className={styles.burpRequestBlock}>
        <div
          className={styles.burpRequestHeader}
          onClick={() => setCollapsed(!collapsed)}
        >
          <TbRadar className={styles.burpRequestIcon} />
          <span className={styles.burpRequestMethod}>{meta.method}</span>
          <span className={styles.burpRequestTarget}>{target}</span>
          {meta.statusCode && (
            <span className={styles.burpRequestStatus}>{meta.statusCode}</span>
          )}
          <span className={styles.burpRequestChevron}>
            {collapsed ? <RightOutlined /> : <DownOutlined />}
          </span>
        </div>
        {!collapsed && (
          <div className={styles.burpRequestBody}>
            <pre>{content}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

function findToolOutput(toolCallId, allMessages) {
  if (!toolCallId || !allMessages) return null;
  return allMessages.find(
    (m) => m.role === "tool" && m.toolCallId === toolCallId,
  );
}

const ChatMessage = React.memo(function ChatMessage({ message, allMessages }) {
  const { role, content, streaming, isError, isSummary, toolCalls, reasoning, reasoningStreaming, burpMeta } = message;

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
    const detectedBurpMeta = burpMeta || detectBurpMeta(content);
    if (detectedBurpMeta) {
      return <BurpRequestBlock content={content} meta={detectedBurpMeta} />;
    }
    return (
      <div className={styles.message}>
        <div className={styles.userMessage}>{content}</div>
      </div>
    );
  }

  if (role === "assistant") {
    return (
      <div className={styles.message}>
        {reasoning && (
          <ReasoningBlock reasoning={reasoning} isStreaming={!!reasoningStreaming} />
        )}
        {content && (
          <div
            className={`${styles.assistantMessage} ${streaming ? styles.streamingCursor : ""}`}
          >
            <ReactMarkdown>{content}</ReactMarkdown>
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
