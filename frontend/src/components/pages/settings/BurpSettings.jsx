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
import styles from "@/styles/pages/Settings.module.scss";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { getBurpConfig, updateBurpConfig } from "@/services/user.service";
import {
  configureBurpCa,
  getBurpCaStatus,
  getBurpConnectionStatus,
} from "@/services/burp.service";

const BurpSettingsPage = () => {
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
        message.success("Burp CA trusted by the Browser Agent");
      } else {
        message.warning(status?.message || "Burp CA setup needs attention");
      }
    },
    onError: (err) => {
      message.error(err?.response?.data?.message || "Failed to configure Burp CA trust");
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
      message.success("Burp configuration saved");
      queryClient.invalidateQueries("burp-config");
      queryClient.invalidateQueries("burp-connection-status");
      queryClient.invalidateQueries("burp-settings-connection-status");
      setSaving(false);
    },
    onError: (err) => {
      message.error(err?.response?.data?.message || "Failed to save Burp config");
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
          ? `Connected — Burp ${result.burpVersion || ""} (extension ${result.extensionVersion || ""})`.trim()
          : result.message || "Connection failed",
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
          <Tag icon={<CheckCircleFilled />} color="success">Configured</Tag>
        ) : (
          <Tag icon={<WarningOutlined />} color="warning">Not Configured</Tag>
        )}
        {configured && (
          <Button
            type="default"
            size="small"
            icon={<ApiOutlined />}
            loading={testing}
            onClick={handleTestConnection}
          >
            Test Connection
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
              {caStatus?.trusted ? "HTTPS interception ready" : "Enable HTTPS interception"}
            </div>
            <div className={styles.burpHttpsDescription}>
              {caStatus?.message || "Checking whether Chromium trusts Burp's CA…"}
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
              ? "Refresh CA trust"
              : caStatus?.needsRefresh
                ? "Refresh CA trust"
                : "Configure in one click"}
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
              label="Burp RPC Host"
              name="host"
              rules={[{ required: true, message: "Host is required" }]}
            >
              <Input placeholder="e.g. 10.69.0.4 or localhost" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label="Port"
              name="port"
              rules={[{ required: true, message: "Port required" }]}
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
            Save Configuration
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
          Setup Guide
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
              <span>Download the Burp RPC extension</span>
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
              Import it as an extension in Burp Suite:
              <br />
              <code style={{
                fontSize: "0.7rem", color: "var(--primary-purple)",
                background: "rgba(127, 86, 217, 0.08)", padding: "1px 4px", borderRadius: 3,
              }}>
                Extensions → Add → Java → select burp-rpc.jar
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
              Enter the host and port above, then save and test the connection.
            </div>
          </div>
        </div>
      </div>

      <div className={styles.notesSection} style={{ marginTop: "1rem" }}>
        <ul>
          <li>
            Default port is <code>50051</code>. Use <code>0.0.0.0</code> binding
            in the extension to allow remote connections.
          </li>
          <li>
            Make sure the firewall on the Burp machine allows inbound traffic
            on the configured port.
          </li>
        </ul>
      </div>
    </div>
  );
};

export default BurpSettingsPage;
