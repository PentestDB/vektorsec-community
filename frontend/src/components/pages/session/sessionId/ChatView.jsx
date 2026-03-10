import React, { useEffect, useRef, useCallback, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { notification } from "antd";
import Image from "next/image";
import styles from "@/styles/components/Chat.module.scss";
import ChatMessage from "./ChatMessage";
import copilotLogoHead from "@/assets/copilot-logo.svg";
import ChatInput from "./ChatInput";
import SlashCommandResult from "./SlashCommandResult";
import ManualExecutionBlock from "./ManualExecutionBlock";
import ConsentBanner from "./ConsentBanner";
import SubagentBlock from "@/components/agent/SubagentBlock";
import useAgentStream from "@/hooks/useAgentStream";
import { useAgentStreamStore } from "@/store/agentStream.store";
import { pauseAgent } from "@/services/agent.service";

export default function ChatView({ sessionId }) {
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);

  const {
    messages,
    setMessages,
    agentState,
    setAgentState,
    pendingConsent,
    setPendingConsent,
    pendingManualExecution,
    setPendingManualExecution,
    subagents,
    startStream,
    abort,
  } = useAgentStream({
    sessionId,
    onComplete: () => {},
  });

  const scrollToBottom = useCallback((behavior = "auto") => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const updateStickToBottom = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    shouldStickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 150;
  }, []);

  const historyLoaded = useAgentStreamStore(
    (state) => state.sessions[sessionId]?.historyLoaded ?? false,
  );
  const historyLoading = !historyLoaded;

  useEffect(() => {
    if (historyLoaded) {
      shouldStickToBottomRef.current = true;
      setTimeout(() => scrollToBottom(), 50);
    }
  }, [historyLoaded, scrollToBottom]);

  useEffect(() => {
    if (shouldStickToBottomRef.current) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const handleContextCleared = (e) => {
      if (e.detail?.sessionId && e.detail.sessionId !== sessionId) return;
      setMessages([]);
      setAgentState("idle");
      setPendingConsent(null);
      setPendingManualExecution(null);
      abort();
    };
    window.addEventListener("context-cleared", handleContextCleared);
    return () => window.removeEventListener("context-cleared", handleContextCleared);
  }, [sessionId, setMessages, setAgentState, setPendingConsent, setPendingManualExecution, abort]);

  const [burpAttachment, setBurpAttachment] = useState(null);

  const buildBurpMessage = useCallback((userText, attachment) => {
    const scheme = attachment.secure ? "https" : "http";
    const target = `${attachment.method} ${scheme}://${attachment.host}${attachment.path}`;
    const tls = attachment.secure ? "Yes" : "No";

    let msg = "";
    if (userText.trim()) {
      msg += `${userText.trim()}\n\n`;
    } else {
      msg += `Analyze and pentest the following HTTP request captured from Burp Suite proxy:\n\n`;
    }
    msg += `Target: ${target}\n`;
    msg += `Host: ${attachment.host} | Port: ${attachment.port || 443} | TLS: ${tls}\n\n`;
    msg += `--- RAW REQUEST ---\n${attachment.rawRequest || "(empty)"}\n--- END REQUEST ---\n`;
    if (attachment.rawResponse) {
      msg += `\n--- RAW RESPONSE ---\n${attachment.rawResponse}\n--- END RESPONSE ---\n`;
    }
    if (!userText.trim()) {
      msg += `\nAnalyze this request for potential vulnerabilities and suggest testing categories.`;
    }
    return { text: msg, burpMeta: { method: attachment.method, host: attachment.host, path: attachment.path, port: attachment.port, secure: attachment.secure, statusCode: attachment.statusCode } };
  }, []);

  const handleSend = useCallback(
    (message) => {
      if (message.startsWith("/")) {
        setMessages((prev) => [
          ...prev,
          {
            id: uuidv4(),
            role: "user",
            content: message,
            isSlashCommand: true,
            timestamp: new Date(),
          },
        ]);
        startStream({ message, endpoint: "slash-command" });
        return;
      }

      let finalMessage = message;
      let burpMeta = null;
      if (burpAttachment) {
        const built = buildBurpMessage(message, burpAttachment);
        finalMessage = built.text;
        burpMeta = built.burpMeta;
        setBurpAttachment(null);
      }

      const endpoint =
        agentState === "paused" ? "resume" : "message";
      startStream({ message: finalMessage, endpoint, burpMeta });
    },
    [agentState, startStream, setMessages, burpAttachment, buildBurpMessage],
  );

  const handlePause = useCallback(async () => {
    try {
      await pauseAgent({ sessionId });
      abort();
    } catch (err) {
      notification.error({
        message: "Failed to pause",
        description: err?.response?.data?.message ?? "Something went wrong",
      });
      abort();
    }
  }, [sessionId, abort]);

  const handleConsent = useCallback(
    (approved) => {
      setPendingConsent(null);
      setAgentState("running");
      startStream({ message: JSON.stringify({ approved }), endpoint: "consent" });
    },
    [setPendingConsent, setAgentState, startStream],
  );

  const handleManualOutput = useCallback(
    (output) => {
      setPendingManualExecution(null);
      setAgentState("running");
      startStream({ message: JSON.stringify({ output }), endpoint: "manual-output" });
    },
    [setPendingManualExecution, setAgentState, startStream],
  );

  const burpPendingProcessed = useRef(false);
  useEffect(() => {
    if (historyLoading || burpPendingProcessed.current) return;
    const pending = sessionStorage.getItem("burp-to-workspace");
    if (pending) {
      sessionStorage.removeItem("burp-to-workspace");
      burpPendingProcessed.current = true;
      try {
        const parsed = JSON.parse(pending);
        setBurpAttachment(parsed);
      } catch {
        setBurpAttachment(null);
      }
    }
  }, [historyLoading]);

  const isEmpty = messages.length === 0 && !historyLoading;

  return (
    <div className={styles.chatContainer}>
      <div
        className={styles.messagesArea}
        ref={messagesContainerRef}
        onScroll={updateStickToBottom}
      >
        {isEmpty && (
          <div className={styles.emptyState}>
            <Image
              src={copilotLogoHead}
              alt=""
              width={76}
              height={80}
              className={styles.emptyStateLogo}
            />
            <h2>Pentest Copilot</h2>
            <p>
              Describe your target and goals below. The agent will autonomously
              perform reconnaissance, enumerate services, identify
              vulnerabilities, and attempt exploitation.
            </p>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.role === "subagent") {
            return <SubagentBlock key={msg.id} message={msg} />;
          }
          if (msg.role === "slash_command_result") {
            return <SlashCommandResult key={msg.id} message={msg} />;
          }
          return <ChatMessage key={msg.id} message={msg} allMessages={messages} />;
        })}

        {pendingConsent && agentState === "waiting_consent" && (
          <ConsentBanner
            pendingConsent={pendingConsent}
            onApprove={() => handleConsent(true)}
            onDeny={() => handleConsent(false)}
          />
        )}

        {pendingManualExecution && agentState === "waiting_manual_execution" && (
          <ManualExecutionBlock
            pending={pendingManualExecution}
            onSubmit={handleManualOutput}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      <ChatInput
        onSend={handleSend}
        onPause={handlePause}
        agentState={agentState}
        disabled={historyLoading || agentState === "waiting_consent" || agentState === "waiting_manual_execution"}
        burpAttachment={burpAttachment}
        onDismissBurpAttachment={() => setBurpAttachment(null)}
      />
    </div>
  );
}
