"use client";

import { useState } from "react";
import { Switch, Spin, Tooltip } from "antd";
import { useQuery, useMutation, useQueryClient } from "react-query";
import { getSessionAgentToolsConfig, updateSessionAgentToolsConfig } from "@/services/agent.service";
import { TbPlugConnected } from "react-icons/tb";

const TOOL_GROUPS = [
  {
    label: "Core",
    description: "Shell and scripting",
    tools: ["run_bash", "run_python_script", "run_install_tool", "spawn_shell", "write_to_shell", "read_shell", "list_shells", "close_shell"],
  },
  {
    label: "Intelligence",
    description: "Search, reasoning, delegation",
    tools: ["google_search", "ask_user", "spawn_subagent"],
  },
  {
    label: "Analysis",
    description: "Vision and image analysis",
    tools: ["view_image"],
  },
  {
    label: "Burp Suite",
    description: "Proxy, repeater, intruder",
    tools: ["search_burp_proxy_history", "send_to_burp_repeater", "send_to_burp_intruder", "burp_collaborator"],
  },
  {
    label: "Browser",
    description: "Magnitude automation",
    tools: ["browser_action"],
  },
  {
    label: "Out-of-Band",
    description: "Blind vulnerability detection",
    tools: ["oob_listener"],
  },
];

const TOOL_LABELS = {
  run_bash: "Run Bash",
  run_python_script: "Run Python",
  run_install_tool: "Install Tool",
  google_search: "Google Search",
  ask_user: "Ask User",
  spawn_shell: "Spawn Shell",
  write_to_shell: "Write to Shell",
  read_shell: "Read Shell",
  list_shells: "List Shells",
  close_shell: "Close Shell",
  spawn_subagent: "Spawn Subagent",
  view_image: "View Image",
  search_burp_proxy_history: "Proxy History",
  send_to_burp_repeater: "Burp Repeater",
  send_to_burp_intruder: "Burp Intruder",
  burp_collaborator: "Burp Collaborator",
  browser_action: "Browser Action",
  oob_listener: "OOB Listener",
};

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

    const currentDisabled = data.tools.filter((t) => !t.enabled).map((t) => t.name);
    const newDisabled = enabled
      ? currentDisabled.filter((n) => n !== toolName)
      : [...currentDisabled, toolName];

    mutation.mutate({ disabledTools: newDisabled });
  };

  const toolMap = {};
  (data?.tools || []).forEach((t) => { toolMap[t.name] = t; });

  const configuredTools = (data?.tools || []).filter((t) => t.configured !== false);
  const enabledCount = configuredTools.filter((t) => t.enabled).length || 0;
  const totalCount = configuredTools.length || 0;

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
          ) : (
            TOOL_GROUPS.map((group) => {
              const groupTools = group.tools.map((name) => toolMap[name]).filter(Boolean);
              if (groupTools.length === 0) return null;

              return (
                <div key={group.label} style={{ marginBottom: "0.6rem" }}>
                  <div style={{
                    fontSize: "0.65rem",
                    fontWeight: 600,
                    color: "var(--primary-text)",
                    marginBottom: "0.2rem",
                  }}>
                    {group.label}
                  </div>
                  {groupTools.map((tool, idx) => {
                    const isConfigured = tool.configured !== false;
                    const row = (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "0.3rem 0",
                          borderBottom: idx < groupTools.length - 1 ? "1px solid var(--border-subtle)" : "none",
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
                          {TOOL_LABELS[tool.name] || tool.name}
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
                        title={isConfigured ? undefined : "Not configured. Configure in Settings."}
                      >
                        {row}
                      </Tooltip>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default AgentToolsPanel;
