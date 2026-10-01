"use client";

import { useState } from "react";
import { Switch, Spin, Tooltip } from "antd";
import { useQuery, useMutation, useQueryClient } from "react-query";
import { getSessionAgentToolsConfig, updateSessionAgentToolsConfig } from "@/services/agent.service";
import { TbPlugConnected } from "react-icons/tb";
import { buildToolGroups, buildDisabledToolNames, countTools } from "@/utils/agentTools";

/**
 * The tool list itself comes from the backend
 * (`GET /api/agent/session/:id/agent-tools-config` → every registered tool with
 * `{ name, description, enabled, configured }`). Group order, labels and the
 * "no tool is ever hidden" fallback live in `@/utils/agentTools`.
 */
const AgentToolsPanel = ({ sessionId }) => {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery(
    ["session-agent-tools", sessionId],
    () => getSessionAgentToolsConfig(sessionId),
    { enabled: !!sessionId && expanded }
  );

  const mutation = useMutation(
    (body) => updateSessionAgentToolsConfig(sessionId, body),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(["session-agent-tools", sessionId]);
      },
    }
  );

  const handleToggle = (toolName, enabled) => {
    if (!data?.tools) return;

    const tool = data.tools.find((t) => t.name === toolName);
    if (tool && tool.configured === false) return;

    const currentDisabled = buildDisabledToolNames(data.tools);
    const newDisabled = enabled
      ? currentDisabled.filter((n) => n !== toolName)
      : [...currentDisabled, toolName];

    mutation.mutate({ disabledTools: newDisabled });
  };

  const groups = buildToolGroups(data?.tools);
  const { enabled: enabledCount, total: totalCount } = countTools(data?.tools);
  const unconfiguredCount = (data?.tools || []).filter((t) => t.configured === false).length;

  return (
    <div style={{ marginBottom: "0.5rem" }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.45rem 0.75rem",
          fontSize: "0.72rem",
          fontWeight: 500,
          color: "var(--secondary-text)",
          background: "var(--secondary-bg)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 6,
          cursor: "pointer",
          userSelect: "none",
          transition: "all 0.15s",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <TbPlugConnected size={14} />
          Agent Tools
          {expanded && totalCount > 0 && (
            <span style={{
              fontSize: "0.65rem",
              fontFamily: "'JetBrains Mono', monospace",
              color: "var(--secondary-text-500)",
              marginLeft: "0.25rem",
            }}>
              {enabledCount}/{totalCount}
              {unconfiguredCount > 0 ? ` · ${unconfiguredCount} not configured` : ""}
            </span>
          )}
        </span>
        <span style={{
          fontSize: "0.6rem",
          transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.2s",
        }}>
          ▼
        </span>
      </div>

      {expanded && (
        <div style={{
          marginTop: "0.35rem",
          padding: "0.5rem",
          background: "var(--surface-active)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 6,
          maxHeight: 280,
          overflowY: "auto",
        }}>
          {isLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "1rem" }}>
              <Spin size="small" />
            </div>
          ) : groups.length === 0 ? (
            <div style={{ fontSize: "0.68rem", color: "var(--secondary-text-500)" }}>
              No agent tools registered.
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.id} style={{ marginBottom: "0.6rem" }}>
                <Tooltip title={group.description}>
                  <div style={{
                    fontSize: "0.65rem",
                    fontWeight: 600,
                    color: "var(--primary-text)",
                    marginBottom: "0.2rem",
                  }}>
                    {group.label}
                    <span style={{
                      fontWeight: 400,
                      color: "var(--secondary-text-500)",
                      marginLeft: "0.3rem",
                    }}>
                      {group.tools.length}
                    </span>
                  </div>
                </Tooltip>
                {group.tools.map((tool, idx) => {
                  const isConfigured = tool.configured;
                  const row = (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0.3rem 0",
                        borderBottom: idx < group.tools.length - 1 ? "1px solid var(--border-subtle)" : "none",
                        opacity: isConfigured ? 1 : 0.5,
                      }}
                    >
                      <span style={{
                        fontSize: "0.68rem",
                        fontWeight: 500,
                        color: isConfigured
                          ? (tool.enabled ? "var(--primary-text)" : "var(--secondary-text-500)")
                          : "var(--secondary-text-500)",
                        fontFamily: "'JetBrains Mono', monospace",
                      }}>
                        {tool.label}
                      </span>
                      {isConfigured ? (
                        <Switch
                          size="small"
                          checked={tool.enabled}
                          loading={mutation.isLoading}
                          onChange={(checked) => handleToggle(tool.name, checked)}
                        />
                      ) : (
                        <span style={{ fontSize: "0.6rem", color: "var(--secondary-text-500)" }}>—</span>
                      )}
                    </div>
                  );
                  return (
                    <Tooltip
                      key={tool.name}
                      title={isConfigured ? tool.description : "Not configured. Configure in Settings."}
                    >
                      {row}
                    </Tooltip>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default AgentToolsPanel;
