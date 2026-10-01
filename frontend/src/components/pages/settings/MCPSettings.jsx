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
import { translate } from "@/i18n";
import { useFormatters, useTranslation } from "@/i18n/I18nProvider";

/**
 * Copy helper — lives outside React, so it uses the non-React `translate()`
 * (which reads the locale cookie) instead of a hook.
 */
const copyText = async (messageApi, text, label) => {
  try {
    await navigator.clipboard.writeText(text);
    messageApi.success(translate("mcpSettings.copied", { label }));
  } catch {
    messageApi.error(translate("mcpSettings.copyFailed", { label }));
  }
};

const redactConfigSecret = (value = "") =>
  value.replace(/token:\s*\S+/g, "token: *****");

const MCPSettingsPage = () => {
  const { t } = useTranslation();
  const { formatDateTime } = useFormatters();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { data, isLoading } = useQuery("mcp-config", getMcpConfig);

  const createTokenMutation = useMutation(createMcpAccessToken, {
    onSuccess: async () => {
      message.success(t("mcpSettings.tokenCreated"));
      await queryClient.invalidateQueries("mcp-config");
    },
    onError: (error) => {
      message.error(
        error?.response?.data?.message || t("mcpSettings.tokenCreateFailed"),
      );
    },
  });

  const revokeTokenMutation = useMutation(revokeMcpAccessToken, {
    onSuccess: async () => {
      message.success(t("mcpSettings.tokenRevoked"));
      await queryClient.invalidateQueries("mcp-config");
    },
    onError: (error) => {
      message.error(
        error?.response?.data?.message || t("mcpSettings.tokenRevokeFailed"),
      );
    },
  });

  const safetyMutation = useMutation(updateMcpSafety, {
    onSuccess: async (res) => {
      message.success(res?.message || t("mcpSettings.safetyUpdated"));
      await queryClient.invalidateQueries("mcp-config");
    },
    onError: (error) => {
      message.error(
        error?.response?.data?.message || t("mcpSettings.safetyUpdateFailed"),
      );
    },
  });

  const primaryToken = useMemo(() => data?.tokens?.[0] || null, [data?.tokens]);

  if (isLoading) return <Loader />;

  return (
    <div className={styles.settingsContainer}>
      <div className={styles.infoBox}>
        <WarningOutlined />
        <span>{t("mcpSettings.warning")}</span>
      </div>

      <section className={styles.mcpPanel}>
        <div className={styles.mcpPanelHeader}>
          <div>
            <div className={styles.mcpPanelTitle}>
              <FileTextOutlined />
              {t("mcpSettings.clientConfigTitle")}
            </div>
            <div className={styles.mcpPanelDescription}>
              {t("mcpSettings.clientConfigDescription")}
            </div>
          </div>
          <Button
            type="primary"
            icon={<CopyOutlined />}
            onClick={() =>
              copyText(
                message,
                data?.configTemplate || "",
                t("mcpSettings.labelConfig"),
              )
            }
          >
            {t("mcpSettings.copyConfig")}
          </Button>
        </div>

        <pre className={styles.mcpCodeBlock}>
          {redactConfigSecret(data?.configTemplate || "")}
        </pre>

        <div className={styles.mcpActionRow}>
          <Button
            icon={<FileTextOutlined />}
            onClick={() =>
              copyText(
                message,
                data?.envTemplate || "",
                t("mcpSettings.labelEnvBlock"),
              )
            }
          >
            {t("mcpSettings.copyEnvBlock")}
          </Button>
          <Button
            icon={<PlusOutlined />}
            onClick={() =>
              createTokenMutation.mutateAsync({
                label: t("mcpSettings.extraTokenLabel", {
                  timestamp: Date.now(),
                }),
              })
            }
            loading={createTokenMutation.isLoading}
          >
            {t("mcpSettings.createToken")}
          </Button>
        </div>
      </section>

      <section className={styles.mcpPanel}>
        <div className={styles.mcpSafetyControl}>
          <div>
            <div className={styles.mcpPanelTitle}>
              <WarningOutlined />
              {t("mcpSettings.safetyTitle")}
            </div>
            <div className={styles.mcpPanelDescription}>
              {t("mcpSettings.safetyDescription")}
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
        <div className={styles.heading}>{t("mcpSettings.activeTokens")}</div>
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
                <Tag color="processing">{t("mcpSettings.primaryTag")}</Tag>
              )}
            </div>
            <div className={styles.mcpTokenMeta}>
              {t("mcpSettings.createdMeta", {
                created: formatDateTime(token.createdAt),
                lastUsed: token.lastUsedAt
                  ? formatDateTime(token.lastUsedAt)
                  : t("mcpSettings.neverUsed"),
              })}
            </div>
            <div className={styles.mcpInlineControl}>
              <Input.Password
                className={styles.mcpReadOnlyInput}
                value={token.token}
                readOnly
                visibilityToggle
              />
              <Tooltip title={t("mcpSettings.copyToken")}>
                <Button
                  icon={<CopyOutlined />}
                  onClick={() =>
                    copyText(message, token.token, t("mcpSettings.labelToken"))
                  }
                />
              </Tooltip>
              <Tooltip
                title={
                  primaryToken?.tokenId === token.tokenId &&
                  (data?.tokens || []).length === 1
                    ? t("mcpSettings.revokeOnlyToken")
                    : t("mcpSettings.revokeToken")
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
