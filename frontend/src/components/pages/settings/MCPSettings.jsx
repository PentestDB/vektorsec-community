"use client";

import Loader from "@/components/common/loader/Loader";
import {
  createMcpAccessToken,
  getMcpConfig,
  revokeMcpAccessToken,
  updateMcpSafety,
} from "@/services/user.service";
import styles from "@/styles/pages/Settings.module.scss";
import { App, Button, Input, Switch, Tag, Tooltip } from "antd";
import {
  CopyOutlined,
  DeleteOutlined,
  FileTextOutlined,
  KeyOutlined,
  PlusOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { useMemo } from "react";

const copyText = async (messageApi, text, label) => {
  try {
    await navigator.clipboard.writeText(text);
    messageApi.success(`${label} copied`);
  } catch {
    messageApi.error(`Failed to copy ${label.toLowerCase()}`);
  }
};

const redactConfigSecret = (value = "") =>
  value.replace(/token:\s*\S+/g, "token: *****");

const MCPSettingsPage = () => {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { data, isLoading } = useQuery("mcp-config", getMcpConfig);

  const createTokenMutation = useMutation(createMcpAccessToken, {
    onSuccess: async () => {
      message.success("New MCP token created");
      await queryClient.invalidateQueries("mcp-config");
    },
    onError: (error) => {
      message.error(error?.response?.data?.message || "Failed to create token");
    },
  });

  const revokeTokenMutation = useMutation(revokeMcpAccessToken, {
    onSuccess: async () => {
      message.success("MCP token revoked");
      await queryClient.invalidateQueries("mcp-config");
    },
    onError: (error) => {
      message.error(error?.response?.data?.message || "Failed to revoke token");
    },
  });

  const safetyMutation = useMutation(updateMcpSafety, {
    onSuccess: async (res) => {
      message.success(res?.message || "MCP safety updated");
      await queryClient.invalidateQueries("mcp-config");
    },
    onError: (error) => {
      message.error(error?.response?.data?.message || "Failed to update MCP safety");
    },
  });

  const primaryToken = useMemo(() => data?.tokens?.[0] || null, [data?.tokens]);

  if (isLoading) return <Loader />;

  return (
    <div className={styles.settingsContainer}>
      <div className={styles.infoBox}>
        <WarningOutlined />
        <span>
          Treat MCP access as local admin access. A token can run commands on
          the exploit box, operate Burp, browser automation, and VPN flows, read
          artifacts, write findings, and update local configuration.
        </span>
      </div>

      <section className={styles.mcpPanel}>
        <div className={styles.mcpPanelHeader}>
          <div>
            <div className={styles.mcpPanelTitle}>
              <FileTextOutlined />
              Client Config
            </div>
            <div className={styles.mcpPanelDescription}>
              Copy one config block into Claude Code, Codex, or another
              MCP-capable client.
            </div>
          </div>
          <Button
            type="primary"
            icon={<CopyOutlined />}
            onClick={() =>
              copyText(message, data?.configTemplate || "", "Config")
            }
          >
            Copy Config
          </Button>
        </div>

        <pre className={styles.mcpCodeBlock}>
          {redactConfigSecret(data?.configTemplate || "")}
        </pre>

        <div className={styles.mcpActionRow}>
          <Button
            icon={<FileTextOutlined />}
            onClick={() =>
              copyText(message, data?.envTemplate || "", "Env Block")
            }
          >
            Copy Env Block
          </Button>
          <Button
            icon={<PlusOutlined />}
            onClick={() =>
              createTokenMutation.mutateAsync({
                label: `Extra Token ${Date.now()}`,
              })
            }
            loading={createTokenMutation.isLoading}
          >
            Create Additional Token
          </Button>
        </div>
      </section>

      <section className={styles.mcpPanel}>
        <div className={styles.mcpSafetyControl}>
          <div>
            <div className={styles.mcpPanelTitle}>
              <WarningOutlined />
              Allow Consent-Gated MCP Tools
            </div>
            <div className={styles.mcpPanelDescription}>
              Enables MCP clients to run tools that normally require in-app
              approval, including browser automation and other side-effecting
              actions. Keep this off unless you trust the connected client.
            </div>
          </div>
          <Switch
            checked={data?.safety?.allowDangerousMcp}
            loading={safetyMutation.isLoading}
            onChange={(checked) =>
              safetyMutation.mutate({ allowDangerousMcp: checked })
            }
          />
        </div>
      </section>

      <div className={styles.settingSectionHeader}>
        <div className={styles.heading}>Active Tokens</div>
        <div className={styles.divider} />
      </div>

      <div className={styles.mcpTokenList}>
        {(data?.tokens || []).map((token) => (
          <div key={token.tokenId} className={styles.mcpTokenItem}>
            <div className={styles.mcpTokenHeader}>
              <div className={styles.mcpTokenTitle}>
                <KeyOutlined />
                {token.label}
              </div>
              {primaryToken?.tokenId === token.tokenId && (
                <Tag color="processing">Primary</Tag>
              )}
            </div>
            <div className={styles.mcpTokenMeta}>
              Created {new Date(token.createdAt).toLocaleString()} - Last used{" "}
              {token.lastUsedAt
                ? new Date(token.lastUsedAt).toLocaleString()
                : "Never"}
            </div>
            <div className={styles.mcpInlineControl}>
              <Input.Password
                className={styles.mcpReadOnlyInput}
                value={token.token}
                readOnly
                visibilityToggle
              />
              <Tooltip title="Copy token">
                <Button
                  icon={<CopyOutlined />}
                  onClick={() => copyText(message, token.token, "Token")}
                />
              </Tooltip>
              <Tooltip
                title={
                  primaryToken?.tokenId === token.tokenId &&
                  (data?.tokens || []).length === 1
                    ? "Create another token before revoking the only token"
                    : "Revoke token"
                }
              >
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  disabled={
                    primaryToken?.tokenId === token.tokenId &&
                    (data?.tokens || []).length === 1
                  }
                  loading={revokeTokenMutation.isLoading}
                  onClick={() => revokeTokenMutation.mutateAsync(token.tokenId)}
                />
              </Tooltip>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MCPSettingsPage;
