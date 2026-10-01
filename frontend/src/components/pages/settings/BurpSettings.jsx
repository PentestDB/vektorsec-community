"use client";

import { useState, useEffect } from "react";
import {
  Form,
  Input,
  InputNumber,
  Row,
  Col,
  Tag,
  App,
  Button,
} from "antd";
import {
  CheckCircleFilled,
  WarningOutlined,
  ApiOutlined,
  DownloadOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import PrimaryButton from "@/components/common/PrimaryButton";
import Loader from "@/components/common/loader/Loader";
import RichText from "@/components/common/RichText";
import { useTranslation } from "@/i18n/I18nProvider";
import styles from "@/styles/pages/Settings.module.scss";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { getBurpConfig, updateBurpConfig } from "@/services/user.service";
import {
  configureBurpCa,
  getBurpCaStatus,
  getBurpConnectionStatus,
} from "@/services/burp.service";

const BurpSettingsPage = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery("burp-config", getBurpConfig);

  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const {
    data: connectionStatus,
    refetch: refetchConnectionStatus,
  } = useQuery("burp-settings-connection-status", getBurpConnectionStatus, {
    enabled: !!data?.configured,
    refetchInterval: 10_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const burpConnected = connectionStatus?.connected === true;

  const {
    data: caStatus,
    isLoading: caStatusLoading,
    refetch: refetchCaStatus,
  } = useQuery("burp-settings-ca-status", getBurpCaStatus, {
    enabled: burpConnected,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const configureCaMutation = useMutation(configureBurpCa, {
    onSuccess: (status) => {
      refetchCaStatus();
      queryClient.invalidateQueries("burp-ca-status");
      if (status?.trusted) {
        message.success(t("burpSettings.caTrusted"));
      } else {
        message.warning(status?.message || t("burpSettings.caNeedsAttention"));
      }
    },
    onError: (err) => {
      message.error(
        err?.response?.data?.message || t("burpSettings.caConfigureFailed"),
      );
    },
  });

  useEffect(() => {
    if (data) {
      form.setFieldsValue({
        host: data.host,
        port: parseInt(data.port, 10) || 50051,
      });
    }
  }, [data, form]);

  const saveMutation = useMutation(updateBurpConfig, {
    onSuccess: () => {
      message.success(t("burpSettings.saved"));
      queryClient.invalidateQueries("burp-config");
      queryClient.invalidateQueries("burp-connection-status");
      queryClient.invalidateQueries("burp-settings-connection-status");
      setSaving(false);
    },
    onError: (err) => {
      message.error(err?.response?.data?.message || t("burpSettings.saveFailed"));
      setSaving(false);
    },
  });

  const onFinish = (values) => {
    setSaving(true);
    saveMutation.mutate({
      host: values.host,
      port: values.port || 50051,
    });
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await getBurpConnectionStatus();
      refetchConnectionStatus();
      setTestResult({
        success: result.connected,
        message: result.connected
          ? t("burpSettings.connectedVersions", {
              burpVersion: result.burpVersion || "?",
              extensionVersion: result.extensionVersion || "?",
            })
          : result.message || t("common.connectionFailed"),
      });
    } catch (err) {
      setTestResult({
        success: false,
        message: err?.response?.data?.message || "Connection failed",
      });
    } finally {
      setTesting(false);
    }
  };

  if (isLoading) return <Loader />;

  const configured = data?.configured;

  return (
    <div className={styles.settingsContainer}>
      <div className={styles.statusRow}>
        {configured ? (
          <Tag icon={<CheckCircleFilled />} color="success">
            {t("common.configured")}
          </Tag>
        ) : (
          <Tag icon={<WarningOutlined />} color="warning">
            {t("common.notConfigured")}
          </Tag>
        )}
        {configured && (
          <Button
            type="default"
            size="small"
            icon={<ApiOutlined />}
            loading={testing}
            onClick={handleTestConnection}
          >
            {t("common.testConnection")}
          </Button>
        )}
      </div>

      {testResult && (
        <div
          style={{
            padding: "0.5rem 0.75rem",
            marginBottom: "1rem",
            borderRadius: 6,
            fontSize: "0.78rem",
            background: testResult.success
              ? "rgba(126, 231, 135, 0.1)"
              : "rgba(255, 62, 62, 0.1)",
            border: `1px solid ${testResult.success ? "rgba(126, 231, 135, 0.3)" : "rgba(255, 62, 62, 0.3)"}`,
            color: testResult.success ? "#7ee787" : "#ff6b6b",
          }}
        >
          {testResult.message}
        </div>
      )}

      {burpConnected && (
        <div className={styles.burpHttpsCard}>
          <div className={styles.burpHttpsIcon} data-ready={caStatus?.trusted || undefined}>
            {caStatus?.trusted ? <CheckCircleFilled /> : <SafetyCertificateOutlined />}
          </div>
          <div className={styles.burpHttpsContent}>
            <div className={styles.burpHttpsTitle}>
              {caStatus?.trusted
                ? t("burpSettings.httpsReady")
                : t("burpSettings.httpsEnable")}
            </div>
            <div className={styles.burpHttpsDescription}>
              {caStatus?.message || t("burpSettings.checkingCa")}
            </div>
            {caStatus?.fingerprint && (
              <code className={styles.burpHttpsFingerprint} title={caStatus.fingerprint}>
                SHA-256 {caStatus.fingerprint}
              </code>
            )}
          </div>
          <Button
            type={caStatus?.trusted ? "default" : "primary"}
            size="small"
            icon={<SafetyCertificateOutlined />}
            loading={caStatusLoading || configureCaMutation.isLoading}
            disabled={!caStatusLoading && !caStatus?.certificateAvailable}
            onClick={() => configureCaMutation.mutate()}
            className={styles.burpHttpsButton}
          >
            {caStatus?.trusted
              ? t("burpSettings.refreshCaTrust")
              : caStatus?.needsRefresh
                ? t("burpSettings.refreshCaTrust")
                : t("burpSettings.configureCa")}
          </Button>
        </div>
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{
          host: data?.host || "",
          port: parseInt(data?.port, 10) || 50051,
        }}
      >
        <Row gutter={16}>
          <Col span={16}>
            <Form.Item
              label={t("burpSettings.hostLabel")}
              name="host"
              rules={[{ required: true, message: t("common.hostRequired") }]}
            >
              <Input placeholder="e.g. 10.69.0.4 or localhost" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label={t("common.portLabel")}
              name="port"
              rules={[{ required: true, message: t("common.portRequired") }]}
            >
              <InputNumber
                min={1}
                max={65535}
                style={{ width: "100%" }}
                placeholder="50051"
              />
            </Form.Item>
          </Col>
        </Row>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
          <PrimaryButton
            htmlType="submit"
            loading={saving}
            purpleFilled
            style={{ height: "2rem", fontSize: "0.75rem" }}
          >
            {t("common.saveConfiguration")}
          </PrimaryButton>
        </div>
      </Form>

      <div style={{
        marginTop: "1.5rem",
        padding: "1rem",
        background: "rgba(74, 158, 255, 0.04)",
        border: "1px solid rgba(74, 158, 255, 0.12)",
        borderRadius: 8,
      }}>
        <div style={{
          fontSize: "0.78rem",
          fontWeight: 600,
          color: "var(--primary-text)",
          marginBottom: "0.75rem",
        }}>
          {t("common.setupGuide")}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
              background: "rgba(74, 158, 255, 0.12)", color: "var(--accent-color, #4a9eff)",
              fontSize: "0.65rem", fontWeight: 700,
            }}>1</span>
            <div style={{ fontSize: "0.75rem", color: "var(--secondary-text)" }}>
              <span>{t("burpSettings.guideDownload")}</span>
              <div style={{ marginTop: "0.35rem" }}>
                <Button
                  type="default"
                  size="small"
                  icon={<DownloadOutlined />}
                  onClick={() => window.open("https://github.com/shero4/burp-rpc/releases", "_blank")}
                  style={{ fontSize: "0.72rem", height: "1.6rem" }}
                >
                  burp-rpc.jar
                </Button>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
              background: "rgba(74, 158, 255, 0.12)", color: "var(--accent-color, #4a9eff)",
              fontSize: "0.65rem", fontWeight: 700,
            }}>2</span>
            <div style={{ fontSize: "0.75rem", color: "var(--secondary-text)" }}>
              {t("burpSettings.guideImport")}
              <br />
              <code style={{
                fontSize: "0.7rem", color: "var(--primary-purple)",
                background: "rgba(127, 86, 217, 0.08)", padding: "1px 4px", borderRadius: 3,
              }}>
                {t("burpSettings.guideImportCommand")}
              </code>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
              background: "rgba(74, 158, 255, 0.12)", color: "var(--accent-color, #4a9eff)",
              fontSize: "0.65rem", fontWeight: 700,
            }}>3</span>
            <div style={{ fontSize: "0.75rem", color: "var(--secondary-text)" }}>
              {t("burpSettings.guideConnect")}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.notesSection} style={{ marginTop: "1rem" }}>
        <ul>
          <li>
            <RichText text={t("burpSettings.noteDefaultPort")} />
          </li>
          <li>{t("burpSettings.noteFirewall")}</li>
        </ul>
      </div>
    </div>
  );
};

export default BurpSettingsPage;
