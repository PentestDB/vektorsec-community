import React, { useEffect, useRef, useCallback } from "react";
import { useQuery } from "react-query";
import { Button, notification } from "antd";
import styles from "@/styles/components/Chat.module.scss";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";
import ManualExecutionBlock from "./ManualExecutionBlock";
import ConsentBanner from "./ConsentBanner";
import useAgentStream from "@/hooks/useAgentStream";
import {
  getSessionHistory,
  pauseAgent,
  connectAgentStream,
} from "@/services/agent.service";

export default function ChatView({ sessionId }) {
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  const {
    messages,
    agentState,
    setAgentState,
    pendingConsent,
    setPendingConsent,
    pendingManualExecution,
    setPendingManualExecution,
    startStream,
    abort,
    loadHistory,
  } = useAgentStream({
    sessionId,
    onComplete: () => {},
  });

  const { isLoading: historyLoading } = useQuery(
    ["agent-history", sessionId],
    () => getSessionHistory(sessionId),
    {
      enabled: !!sessionId,
      refetchOnWindowFocus: false,
      onSuccess: (data) => {
        if (data?.messages) {
          loadHistory(data.messages);
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
      },
    },
  );

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSend = useCallback(
    (message) => {
      const endpoint =
        agentState === "paused" ? "resume" : "message";
      startStream({ message, endpoint });
    },
    [agentState, startStream],
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

  const isEmpty = messages.length === 0 && !historyLoading;

  return (
    <div className={styles.chatContainer}>
      <div className={styles.messagesArea} ref={messagesContainerRef}>
        {isEmpty && (
          <div className={styles.emptyState}>
            <h2>Pentest Copilot</h2>
            <p>
              Describe your target and goals below. The agent will autonomously
              perform reconnaissance, enumerate services, identify
              vulnerabilities, and attempt exploitation.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} allMessages={messages} />
        ))}

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
