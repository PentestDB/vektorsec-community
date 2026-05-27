"use client";

import Loader from "@/components/common/loader/Loader";
import {
  createMcpAccessToken,
  getMcpConfig,
  revokeMcpAccessToken,
} from "@/services/user.service";
import styles from "@/styles/pages/Settings.module.scss";
import { App, Button, Card, Input, Space, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { useMemo } from "react";

const { Paragraph, Text } = Typography;

const copyText = async (messageApi, text, label) => {
  try {
    await navigator.clipboard.writeText(text);
    messageApi.success(`${label} copied`);
  } catch {
    messageApi.error(`Failed to copy ${label.toLowerCase()}`);
  }
};

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

  const primaryToken = useMemo(() => data?.tokens?.[0] || null, [data?.tokens]);

  if (isLoading) return <Loader />;

  return (
    <div className={styles.settingsContainer}>
      <Card
        bordered={false}
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          marginBottom: 20,
        }}
      >
        <Paragraph style={{ color: "var(--secondary-text)", marginBottom: 16 }}>
          Use this endpoint and token with any MCP-capable client. The backend serves MCP directly at
          <Text code style={{ marginLeft: 6 }}>{data?.endpoint}</Text>.
        </Paragraph>

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>MCP Endpoint</label>
          <Input value={data?.endpoint || ""} readOnly />
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Universal MCP Token</label>
          <Input.Password value={data?.token || ""} readOnly visibilityToggle />
        </div>

        <Space wrap style={{ marginTop: 12 }}>
          <Button onClick={() => copyText(message, data?.endpoint || "", "Endpoint")}>Copy Endpoint</Button>
          <Button onClick={() => copyText(message, data?.token || "", "Token")}>Copy Token</Button>
          <Button type="primary" onClick={() => copyText(message, data?.configTemplate || "", "Config")}>
            Copy Config
          </Button>
          <Button onClick={() => copyText(message, data?.envTemplate || "", "Env Block")}>
            Copy Env Block
          </Button>
        </Space>
      </Card>

      <div className={styles.settingSectionHeader}>
        <div className={styles.settingSectionHeaderRow}>
          <div className={styles.heading}>Config Template</div>
          <Button
            className={styles.headerExtraButton}
            onClick={() => createTokenMutation.mutateAsync({ label: `Extra Token ${Date.now()}` })}
            loading={createTokenMutation.isLoading}
          >
            Create Additional Token
          </Button>
        </div>
        <div className={styles.divider} />
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>Canonical MCP Config</label>
        <Input.TextArea value={data?.configTemplate || ""} readOnly autoSize={{ minRows: 7, maxRows: 10 }} />
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>Environment Block</label>
        <Input.TextArea value={data?.envTemplate || ""} readOnly autoSize={{ minRows: 2, maxRows: 4 }} />
      </div>

      <div className={styles.settingSectionHeader}>
        <div className={styles.heading}>Active Tokens</div>
        <div className={styles.divider} />
      </div>

      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        {(data?.tokens || []).map((token) => (
          <Card
            key={token.tokenId}
            bordered={false}
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <Space direction="vertical" style={{ width: "100%" }} size={6}>
              <Text strong style={{ color: "var(--primary-text)" }}>{token.label}</Text>
              <Text style={{ color: "var(--secondary-text)" }}>
                Created: {new Date(token.createdAt).toLocaleString()}
              </Text>
              <Text style={{ color: "var(--secondary-text)" }}>
                Last used: {token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleString() : "Never"}
              </Text>
              <Input.Password value={token.token} readOnly visibilityToggle />
              <Space wrap>
                <Button onClick={() => copyText(message, token.token, "Token")}>Copy</Button>
                <Button
                  danger
                  disabled={primaryToken?.tokenId === token.tokenId && (data?.tokens || []).length === 1}
                  loading={revokeTokenMutation.isLoading}
                  onClick={() => revokeTokenMutation.mutateAsync(token.tokenId)}
                >
                  Revoke
                </Button>
              </Space>
            </Space>
          </Card>
        ))}
      </Space>
    </div>
  );
};

export default MCPSettingsPage;
