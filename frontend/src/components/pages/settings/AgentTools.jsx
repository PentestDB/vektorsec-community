"use client";

import { Switch, message, Spin } from "antd";
import { useQuery, useMutation, useQueryClient } from "react-query";
import { getAgentToolsConfig, updateAgentToolsConfig } from "@/services/user.service";
import styles from "@/styles/pages/Settings.module.scss";

const TOOL_GROUPS = [
  {
    label: "Core",
    description: "Essential shell and scripting tools",
    tools: ["run_bash", "run_python_script", "run_install_tool", "spawn_shell", "write_to_shell", "read_shell", "list_shells", "close_shell"],
  },
  {
    label: "Intelligence",
    description: "Search, reasoning, and delegation",
    tools: ["google_search", "ask_user", "spawn_subagent"],
  },
  {
    label: "Burp Suite",
    description: "Proxy history, repeater, intruder, and collaborator",
    tools: ["search_burp_proxy_history", "send_to_burp_repeater", "send_to_burp_intruder", "burp_collaborator"],
  },
  {
    label: "Browser",
    description: "Agentic browser automation via Magnitude",
    tools: ["browser_action"],
  },
];

const TOOL_LABELS = {
  run_bash: "Run Bash Command",
  run_python_script: "Run Python Script",
  run_install_tool: "Install Tool",
  google_search: "Google Search",
  ask_user: "Ask User",
  spawn_shell: "Spawn Shell",
  write_to_shell: "Write to Shell",
  read_shell: "Read Shell",
  list_shells: "List Shells",
  close_shell: "Close Shell",
  spawn_subagent: "Spawn Subagent",
  search_burp_proxy_history: "Search Proxy History",
  send_to_burp_repeater: "Send to Burp Repeater",
  send_to_burp_intruder: "Send to Burp Intruder",
  burp_collaborator: "Burp Collaborator",
  browser_action: "Browser Action",
};

const AgentToolsPage = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery("agent-tools-config", getAgentToolsConfig);

  const mutation = useMutation(updateAgentToolsConfig, {
    onSuccess: () => {
      queryClient.invalidateQueries("agent-tools-config");
      message.success({ content: "Tool configuration saved", duration: 2 });
    },
    onError: () => {
      message.error({ content: "Failed to update tool configuration", duration: 3 });
    },
  });

  const handleToggle = (toolName, enabled) => {
    if (!data?.tools) return;

    const currentDisabled = data.tools
      .filter((t) => !t.enabled)
      .map((t) => t.name);

    const newDisabled = enabled
      ? currentDisabled.filter((n) => n !== toolName)
      : [...currentDisabled, toolName];

    mutation.mutate({ disabledTools: newDisabled });
  };

  if (isLoading) {
    return (
      <div className={styles.settingsContainer} style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
        <Spin />
      </div>
    );
  }

  const toolMap = {};
  (data?.tools || []).forEach((t) => { toolMap[t.name] = t; });

  const enabledCount = data?.tools?.filter((t) => t.enabled).length || 0;
  const totalCount = data?.tools?.length || 0;

  return (
    <div className={styles.settingsContainer}>
      <div style={{
        fontSize: "0.72rem",
        color: "var(--secondary-text-500)",
        marginBottom: "1.25rem",
        lineHeight: 1.5,
      }}>
        Enable or disable individual agent tools. Disabled tools will not be available to the AI agent during sessions.
        <span style={{
          display: "inline-block",
          marginLeft: "0.5rem",
          fontSize: "0.65rem",
          fontFamily: "'JetBrains Mono', monospace",
          color: "var(--secondary-text)",
          background: "var(--surface-active)",
          padding: "0.1rem 0.4rem",
          borderRadius: "3px",
        }}>
          {enabledCount}/{totalCount} enabled
        </span>
      </div>

      {TOOL_GROUPS.map((group) => {
        const groupTools = group.tools
          .map((name) => toolMap[name])
          .filter(Boolean);

        if (groupTools.length === 0) return null;

        return (
          <div key={group.label} style={{ marginBottom: "1.25rem" }}>
            <div style={{
              fontSize: "0.7rem",
              fontWeight: 600,
              color: "var(--primary-text)",
              marginBottom: "0.15rem",
            }}>
              {group.label}
            </div>
            <div style={{
              fontSize: "0.62rem",
              color: "var(--secondary-text-500)",
              marginBottom: "0.5rem",
            }}>
              {group.description}
            </div>

            <div style={{
              border: "1px solid var(--border-subtle)",
              borderRadius: "6px",
              overflow: "hidden",
            }}>
              {groupTools.map((tool, idx) => (
                <div
                  key={tool.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.5rem 0.75rem",
                    borderBottom: idx < groupTools.length - 1 ? "1px solid var(--border-subtle)" : "none",
                    background: tool.enabled ? "transparent" : "rgba(255,255,255,0.01)",
                    transition: "background 150ms ease",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: "0.72rem",
                      fontWeight: 500,
                      color: tool.enabled ? "var(--primary-text)" : "var(--secondary-text-500)",
                      fontFamily: "'JetBrains Mono', monospace",
                      transition: "color 150ms ease",
                    }}>
                      {TOOL_LABELS[tool.name] || tool.name}
                    </div>
                    <div style={{
                      fontSize: "0.6rem",
                      color: "var(--secondary-text-500)",
                      marginTop: "0.1rem",
                      lineHeight: 1.4,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {tool.description}
                    </div>
                  </div>
                  <Switch
                    size="small"
                    checked={tool.enabled}
                    loading={mutation.isLoading}
                    onChange={(checked) => handleToggle(tool.name, checked)}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AgentToolsPage;
