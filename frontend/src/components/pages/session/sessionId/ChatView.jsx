import React, { useEffect, useRef, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { useQuery } from "react-query";
import { Button, notification } from "antd";
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
import {
  getSessionHistory,
  pauseAgent,
} from "@/services/agent.service";

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
    loadHistory,
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

  const { isLoading: historyLoading } = useQuery(
    ["agent-history", sessionId],
    () => getSessionHistory(sessionId),
    {
      enabled: !!sessionId,
      refetchOnWindowFocus: false,
      retry: 2,
      onSuccess: (data) => {
        if (data?.messages) {
          loadHistory(data.messages, data.subagents);
        }
        if (data?.agentState) {
          setAgentState(data.agentState);
        }
        if (data?.pendingConsent) {
          setPendingConsent(data.pendingConsent);
        }
        if (data?.pendingManualExecution) {
          setPendingManualExecution(data.pendingManualExecution);
        }
        shouldStickToBottomRef.current = true;
        setTimeout(() => {
          scrollToBottom();
        }, 50);
      },
      onError: (err) => {
        notification.error({
          message: "Failed to load session history",
          description: err?.response?.data?.message ?? err?.message ?? "Something went wrong",
          duration: 6,
          placement: "bottomRight",
        });
      },
    },
  );

  useEffect(() => {
    if (shouldStickToBottomRef.current) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom]);

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
      const endpoint =
        agentState === "paused" ? "resume" : "message";
      startStream({ message, endpoint });
    },
    [agentState, startStream, setMessages],
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

  // Check for pending Burp requests on mount / navigation
  const burpPendingProcessed = useRef(false);
  useEffect(() => {
    if (historyLoading || burpPendingProcessed.current) return;
    const pending = sessionStorage.getItem("burp-to-workspace");
    if (pending) {
      sessionStorage.removeItem("burp-to-workspace");
      burpPendingProcessed.current = true;
      setTimeout(() => handleSend(pending), 300);
    }
  }, [historyLoading, handleSend]);

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
      />
    </div>
  );
}
