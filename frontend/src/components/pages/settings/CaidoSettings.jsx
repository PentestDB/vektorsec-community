"use client";

import { useState, useEffect } from "react";
import { Form, Input, Row, Col, Tag, App, Button } from "antd";
import {
  CheckCircleFilled,
  WarningOutlined,
  ApiOutlined,
  KeyOutlined,
} from "@ant-design/icons";
import PrimaryButton from "@/components/common/PrimaryButton";
import Loader from "@/components/common/loader/Loader";
import styles from "@/styles/pages/Settings.module.scss";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { getCaidoConfig, updateCaidoConfig } from "@/services/user.service";
import { getCaidoConnectionStatus } from "@/services/caido.service";

const CaidoSettingsPage = () => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery("caido-config", getCaidoConfig);

  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    if (data) {
      form.setFieldsValue({
        url: data.url,
        pat: "",
        proxyUrl: data.proxyUrl || data.url,
      });
    }
  }, [data, form]);

  const saveMutation = useMutation(updateCaidoConfig, {
    onSuccess: () => {
      message.success("Configuration saved");
      queryClient.invalidateQueries("caido-config");
      queryClient.invalidateQueries("caido-connection-status");
      setSaving(false);
      form.setFieldsValue({ pat: "" });
    },
    onError: (err) => {
      message.error(err?.response?.data?.message || "Failed to save configuration");
      setSaving(false);
    },
  });

  const onFinish = (values) => {
    setSaving(true);
    const body = {
      url: values.url,
      proxyUrl: values.proxyUrl || values.url,
    };
    if (values.pat) body.pat = values.pat;
    saveMutation.mutate(body);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await getCaidoConnectionStatus();
      setTestResult({
        success: result.connected,
        message: result.connected
          ? `Connected${result.viewer?.id ? ` as ${result.viewer.id}` : ""}`
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
        {data?.patConfigured && <Tag icon={<KeyOutlined />} color="blue">PAT Saved</Tag>}
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

      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{
          url: data?.url || "",
          pat: "",
          proxyUrl: data?.proxyUrl || data?.url || "",
        }}
      >
        <Form.Item
          label="URL"
          name="url"
          rules={[{ required: true, message: "URL is required" }]}
        >
          <Input placeholder="http://192.168.160.1:8096" />
        </Form.Item>

        <Row gutter={16}>
          <Col span={14}>
            <Form.Item label="Personal Access Token" name="pat">
              <Input.Password
                placeholder={data?.patConfigured ? "Leave blank to keep existing PAT" : "caido_..."}
              />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item label="Proxy URL" name="proxyUrl">
              <Input placeholder="Defaults to URL" />
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
        <div style={{ fontSize: "0.75rem", color: "var(--secondary-text)", lineHeight: 1.7 }}>
          <div style={{ marginBottom: "0.6rem" }}>
            <strong>WSL:</strong> Set the instance to listen on{" "}
            <code>0.0.0.0:8096</code>, allow <code>caido-cli</code> through
            Windows Firewall, then use the WSL gateway IP in the URL above. Get
            the gateway with{" "}
            <code>ip route show | grep -i default | awk '{"{ print $3 }"}'</code>.
          </div>
          <div style={{ marginBottom: "0.6rem" }}>
            <strong>Server / non-localhost:</strong> When the backend reaches
            Caido over a Docker network (a service name or gateway IP as the
            Host), the instance replies <code>Domain &lt;name&gt; not allowed</code>.
            Start <code>caido-cli</code> with the host allow-listed, e.g.{" "}
            <code>--ui-domain caido --ui-domain localhost --ui-domain 127.0.0.1</code>.
          </div>
          <div>
            <strong>Headless needs a Teams plan:</strong> registering a headless{" "}
            <code>caido-cli</code> instance requires a registration key
            (<code>ckey_</code>), which is a Caido Teams feature. On an Individual
            plan a headless instance serves GraphQL but device approval fails with{" "}
            <code>Unregistered instance</code> — use a desktop Caido (already
            registered) reached over a reverse SSH tunnel instead.
          </div>
        </div>
      </div>

      <div className={styles.notesSection} style={{ marginTop: "1rem" }}>
        <ul>
          <li>HTTP History, Replay, Automate, and Intercept controls are available.</li>
          <li>Traffic and API calls are proxied through the backend.</li>
        </ul>
      </div>
    </div>
  );
};

export default CaidoSettingsPage;
