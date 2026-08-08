"use client";

import { useState, useEffect } from "react";
import {
  Form,
  Input,
  InputNumber,
  Radio,
  Row,
  Col,
  Tag,
  App,
  Divider,
  Tooltip,
  Button,
  Switch,
  Alert,
} from "antd";
import {
  CheckCircleFilled,
  InfoCircleOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { TbTerminal2 } from "react-icons/tb";
import PrimaryButton from "@/components/common/PrimaryButton";
import Loader from "@/components/common/loader/Loader";
import styles from "@/styles/pages/Settings.module.scss";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { getSSHConfig, updateSSHConfig, updateSafetyProtections } from "@/services/user.service";
import { apiClient } from "@/utils/axios.config";

const SSHPage = () => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery("ssh-config", getSSHConfig);

  const [form] = Form.useForm();
  const [authMethod, setAuthMethod] = useState("password");
  const [saving, setSaving] = useState(false);
  const [testingSSH, setTestingSSH] = useState(false);
  const [safetyDisabled, setSafetyDisabled] = useState(false);

  useEffect(() => {
    if (data) {
      form.setFieldsValue({
        host: data.host,
        port: parseInt(data.port, 10) || 22,
        username: data.username,
        authMethod: data.authMethod || "password",
      });
      setAuthMethod(data.authMethod || "password");
      setSafetyDisabled(data.disableSafetyProtections ?? false);
    }
  }, [data, form]);

  const safetyMutation = useMutation(updateSafetyProtections, {
    onSuccess: (_, variables) => {
      setSafetyDisabled(variables.disableSafetyProtections);
      queryClient.invalidateQueries("ssh-config");
      message.success(
        variables.disableSafetyProtections
          ? "Safety protections disabled"
          : "Safety protections enabled"
      );
    },
    onError: (err) => {
      setSafetyDisabled(!safetyDisabled);
      message.error(err?.response?.data?.message || "Failed to update safety protections");
    },
  });

  const saveMutation = useMutation(updateSSHConfig, {
    onSuccess: () => {
      message.success("SSH configuration saved");
      queryClient.invalidateQueries("ssh-config");
      setSaving(false);
    },
    onError: (err) => {
      message.error(err?.response?.data?.message || "Failed to save SSH config");
      setSaving(false);
    },
  });

  const onFinish = (values) => {
    setSaving(true);
    saveMutation.mutate({
      host: values.host,
      port: values.port || 22,
      username: values.username,
      authMethod: values.authMethod,
      password: values.password,
      privateKeyPath: values.privateKeyPath,
      passphrase: values.passphrase,
    });
  };

  if (isLoading) return <Loader />;

  const configured = data?.configured;

  return (
    <div className={styles.settingsContainer}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Legacy fallback only"
        description="For parallel work, open Connection inside each session and choose a mounted ~/.ssh/config alias. This form remains available for older environment-based setups."
      />
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
            icon={<TbTerminal2 />}
            loading={testingSSH}
            onClick={async () => {
              setTestingSSH(true);
              try {
                const { data: res } = await apiClient.post("/shell/test-ssh");
                if (res.success) {
                  message.success(res.message);
                } else {
                  message.error(res.message || "SSH connection failed");
                }
              } catch (err) {
                message.error(err?.response?.data?.message || "SSH connection failed");
              } finally {
                setTestingSSH(false);
              }
            }}
          >
            Test connectivity
          </Button>
        )}
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{
          host: data?.host || "",
          port: parseInt(data?.port, 10) || 22,
          username: data?.username || "",
          authMethod: data?.authMethod || "password",
        }}
      >
        <Row gutter={16}>
          <Col span={16}>
            <Form.Item
              label="Host"
              name="host"
              rules={[{ required: true, message: "SSH host is required" }]}
            >
              <Input placeholder="e.g. 192.168.1.100 or kali.local" />
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
                placeholder="22"
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          label="Username"
          name="username"
          rules={[{ required: true, message: "Username is required" }]}
        >
          <Input placeholder="e.g. root" />
        </Form.Item>

        <Divider style={{ borderColor: "var(--border-color-100)", margin: "0.5rem 0 1rem" }} />

        <Form.Item
          label={
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              Authentication Method
              <Tooltip title="Password is simpler; private key is more secure and recommended for production.">
                <InfoCircleOutlined style={{ color: "var(--secondary-text)", fontSize: "0.7rem" }} />
              </Tooltip>
            </span>
          }
          name="authMethod"
        >
          <Radio.Group
            onChange={(e) => setAuthMethod(e.target.value)}
            style={{ display: "flex", gap: 16 }}
          >
            <Radio value="password">
              <span style={{ color: "var(--primary-text)", fontSize: "0.78rem" }}>Password</span>
            </Radio>
            <Radio value="key">
              <span style={{ color: "var(--primary-text)", fontSize: "0.78rem" }}>Private Key</span>
            </Radio>
          </Radio.Group>
        </Form.Item>

        {authMethod === "password" ? (
          <Form.Item
            label="Password"
            name="password"
            extra={
              data?.password ? (
                <span className={styles.fieldHint}>
                  A password is already set. Leave blank to keep it unchanged.
                </span>
              ) : null
            }
          >
            <Input.Password placeholder={data?.password ? "••••••••" : "Enter SSH password"} />
          </Form.Item>
        ) : (
          <>
            <Form.Item
              label={
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  Private Key Path
                  <Tooltip title="Absolute path to the private key file on the server filesystem (e.g. /root/.ssh/id_rsa).">
                    <InfoCircleOutlined style={{ color: "var(--secondary-text)", fontSize: "0.7rem" }} />
                  </Tooltip>
                </span>
              }
              name="privateKeyPath"
              extra={
                data?.hasPrivateKey ? (
                  <span className={styles.fieldHint}>
                    A private key path is already configured. Leave blank to keep it unchanged.
                  </span>
                ) : null
              }
            >
              <Input placeholder="e.g. /root/.ssh/id_rsa" />
            </Form.Item>
            <Form.Item label="Passphrase (optional)" name="passphrase">
              <Input.Password placeholder="Leave empty if key has no passphrase" />
            </Form.Item>
          </>
        )}

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

      <Divider style={{ borderColor: "var(--border-color-100)", margin: "1.25rem 0 0.75rem" }} />

      <div className={styles.safetySection}>
        <div className={styles.safetySectionHeader}>
          <div>
            <div className={styles.safetySectionTitle}>
              <WarningOutlined style={{ color: safetyDisabled ? "#ff4d4f" : "var(--secondary-text)" }} />
              Disable Safety Protections
            </div>
            <div className={styles.safetySectionDesc}>
              When enabled, destructive commands (<code>rm -rf /</code>, disk wipes, system shutdowns, etc.)
              will execute without confirmation, even in auto-run mode.
              The workspace directory (<code>~/pentest-workspace</code>) is still used.
            </div>
          </div>
          <Switch
            checked={safetyDisabled}
            loading={safetyMutation.isLoading}
            onChange={(checked) => {
              setSafetyDisabled(checked);
              safetyMutation.mutate({ disableSafetyProtections: checked });
            }}
            className={safetyDisabled ? styles.dangerSwitch : undefined}
          />
        </div>
      </div>

      <Divider style={{ borderColor: "var(--border-color-100)", margin: "1.25rem 0 0.75rem" }} />

      <div className={styles.notesSection}>
        <ul>
          <li>
            In <strong>Docker mode</strong>, the default host is the container name
            (e.g. <code>kali</code>) with port <code>4242</code>.
          </li>
          <li>
            In <strong>Developer mode</strong>, point this to your local
            exploit box or VM (typically <code>localhost</code>).
          </li>
          <li>Private key authentication is recommended for production.</li>
        </ul>
      </div>

    </div>
  );
};

export default SSHPage;
