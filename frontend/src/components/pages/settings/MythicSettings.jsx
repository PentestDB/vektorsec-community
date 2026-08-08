"use client";

import { useState, useEffect } from "react";
import { Form, Input, Tag, App, Button, Switch } from "antd";
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
import {
  getMythicConfig,
  updateMythicConfig,
  getMythicConnectionStatus,
} from "@/services/mythic.service";

const MythicSettingsPage = () => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery("mythic-config", getMythicConfig);

  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    if (data) {
      form.setFieldsValue({
        url: data.url,
        token: "",
        insecureTls: !!data.insecureTls,
      });
    }
  }, [data, form]);

  const saveMutation = useMutation(updateMythicConfig, {
    onSuccess: () => {
      message.success("Mythic configuration saved");
      queryClient.invalidateQueries("mythic-config");
      queryClient.invalidateQueries("mythic-connection-status");
      setSaving(false);
      form.setFieldsValue({ token: "" });
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
      insecureTls: !!values.insecureTls,
    };
    // Only send the token when the operator typed one, so the stored value survives
    // an ordinary save and never round-trips to the browser.
    if (values.token) body.token = values.token;
    saveMutation.mutate(body);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await getMythicConnectionStatus();
      setTestResult({
        success: result.connected,
        message: result.connected
          ? `Connected${result.operation ? ` to operation "${result.operation}"` : ""} — ` +
            `${result.callbackCount ?? 0} callback(s) visible`
          : result.error || "Connection failed",
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
        {data?.tokenConfigured && <Tag icon={<KeyOutlined />} color="blue">Token Saved</Tag>}
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
          token: "",
          insecureTls: !!data?.insecureTls,
        }}
      >
        <Form.Item
          label="Mythic Server URL"
          name="url"
          rules={[{ required: true, message: "URL is required" }]}
        >
          <Input placeholder="https://10.0.0.5:7443" />
        </Form.Item>

        <Form.Item label="API Token" name="token">
          <Input.Password
            placeholder={data?.tokenConfigured ? "Leave blank to keep existing token" : "mtk_..."}
          />
        </Form.Item>

        <Form.Item
          label="Allow self-signed certificate"
          name="insecureTls"
          valuePropName="checked"
          extra="Mythic ships a self-signed certificate by default. Enabling this disables certificate verification for requests to this server only — leave it off if you have given Mythic a trusted certificate."
        >
          <Switch />
        </Form.Item>

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
            <strong>1. Start Mythic:</strong> on your C2 host, run{" "}
            <code>sudo ./mythic-cli start</code>. The UI and GraphQL API listen on{" "}
            <code>7443</code> by default.
          </div>
          <div style={{ marginBottom: "0.6rem" }}>
            <strong>2. Create an API token:</strong> in the Mythic UI go to{" "}
            <strong>Operations → API Tokens</strong> and create one. Scope it to the
            minimum you need — read-only is enough if you only want visibility; the
            tasking, payload and pivot tools need write access.
          </div>
          <div style={{ marginBottom: "0.6rem" }}>
            <strong>3. Reachability:</strong> Mythic binds its ports to{" "}
            <code>127.0.0.1</code> by default. Pentest Copilot must be able to reach{" "}
            the URL above, and — separately — your work host must be able to reach any{" "}
            SOCKS port you open, since those listeners bind on the Mythic server rather
            than on the work host.
          </div>
          <div>
            <strong>4. Verify the schema:</strong> Mythic&apos;s GraphQL schema varies by
            version and installed agents. If a tool reports a schema error, run{" "}
            <code>pnpm mythic:introspect</code> in the backend to dump what your server
            actually exposes.
          </div>
        </div>
      </div>

      <div className={styles.notesSection} style={{ marginTop: "1rem" }}>
        <ul>
          <li>
            All C2 data — callbacks, tasks, payloads, files and credentials — stays in
            Mythic. Pentest Copilot stores only this connection config.
          </li>
          <li>
            Tasking an implant, opening a pivot, building a payload and uploading to a
            target all require your explicit approval before they run.
          </li>
          <li>Manage live callbacks from the Mythic C2 tab inside a session.</li>
        </ul>
      </div>
    </div>
  );
};

export default MythicSettingsPage;
