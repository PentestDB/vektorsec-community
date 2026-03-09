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
  message,
  Divider,
  Tooltip,
  Button,
} from "antd";
import {
  CheckCircleFilled,
  InfoCircleOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { TbTerminal2 } from "react-icons/tb";
import PrimaryButton from "@/components/common/PrimaryButton";
import Loader from "@/components/common/loader/Loader";
import SSHTestTerminalModal from "./SSHTestTerminalModal";
import styles from "@/styles/pages/Settings.module.scss";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { getSSHConfig, updateSSHConfig } from "@/services/user.service";

const SSHPage = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery("ssh-config", getSSHConfig);

  const [form] = Form.useForm();
  const [authMethod, setAuthMethod] = useState("password");
  const [saving, setSaving] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);

  useEffect(() => {
    if (data) {
      form.setFieldsValue({
        host: data.host,
        port: parseInt(data.port, 10) || 22,
        username: data.username,
        authMethod: data.authMethod || "password",
      });
      setAuthMethod(data.authMethod || "password");
    }
  }, [data, form]);

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
      <div style={{ maxWidth: 620 }}>
        <p
          style={{
            color: "var(--secondary-text)",
            fontSize: "0.78rem",
            margin: "0 0 1.5rem 0",
            lineHeight: 1.6,
          }}
        >
          Configure SSH connection details for your exploit box. The copilot
          uses this to execute commands remotely during pentesting sessions.
        </p>

        <div
          style={{
            background: "var(--secondary-bg)",
            border: "1px solid var(--border-color-100)",
            borderRadius: 8,
            padding: "1.25rem 1.5rem",
            marginBottom: "1.5rem",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  color: "var(--primary-text)",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                }}
              >
                Exploit Box Connection
              </span>
              {configured && (
                <Button
                  type="default"
                  size="small"
                  icon={<TbTerminal2 />}
                  onClick={() => setTestModalOpen(true)}
                  style={{ fontSize: "0.75rem" }}
                >
                  Test connectivity
                </Button>
              )}
              {configured ? (
                <Tag
                  icon={<CheckCircleFilled />}
                  color="success"
                  style={{ fontSize: "0.65rem", margin: 0 }}
                >
                  Configured
                </Tag>
              ) : (
                <Tag
                  icon={<WarningOutlined />}
                  color="warning"
                  style={{ fontSize: "0.65rem", margin: 0 }}
                >
                  Not Configured
                </Tag>
              )}
            </div>
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

            <Divider
              style={{
                borderColor: "var(--border-color-100)",
                margin: "0.75rem 0 1rem",
              }}
            />

            <Form.Item
              label={
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  Authentication Method
                  <Tooltip title="Password is simpler; private key is more secure and recommended for production.">
                    <InfoCircleOutlined
                      style={{
                        color: "var(--secondary-text)",
                        fontSize: "0.7rem",
                      }}
                    />
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
                  <span style={{ color: "var(--primary-text)", fontSize: "0.78rem" }}>
                    Password
                  </span>
                </Radio>
                <Radio value="key">
                  <span style={{ color: "var(--primary-text)", fontSize: "0.78rem" }}>
                    Private Key
                  </span>
                </Radio>
              </Radio.Group>
            </Form.Item>

            {authMethod === "password" ? (
              <Form.Item
                label="Password"
                name="password"
                extra={
                  data?.password ? (
                    <span style={{ fontSize: "0.65rem", color: "var(--secondary-text)" }}>
                      A password is already set. Leave blank to keep it unchanged.
                    </span>
                  ) : null
                }
              >
                <Input.Password
                  placeholder={data?.password ? "••••••••" : "Enter SSH password"}
                />
              </Form.Item>
            ) : (
              <>
                <Form.Item
                  label={
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      Private Key Path
                      <Tooltip title="Absolute path to the private key file on the server filesystem (e.g. /root/.ssh/id_rsa). For Docker, mount the key into the container.">
                        <InfoCircleOutlined
                          style={{
                            color: "var(--secondary-text)",
                            fontSize: "0.7rem",
                          }}
                        />
                      </Tooltip>
                    </span>
                  }
                  name="privateKeyPath"
                  extra={
                    data?.hasPrivateKey ? (
                      <span style={{ fontSize: "0.65rem", color: "var(--secondary-text)" }}>
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

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
              <PrimaryButton
                htmlType="submit"
                loading={saving}
                purpleFilled
                style={{ height: "2rem", fontSize: "0.75rem" }}
              >
                Save SSH Configuration
              </PrimaryButton>
            </div>
          </Form>
        </div>

        <Divider
          style={{
            borderColor: "var(--border-color-100)",
            margin: "1.5rem 0 1rem",
          }}
        />

        <div
          style={{
            color: "var(--secondary-text)",
            fontSize: "0.7rem",
            lineHeight: 1.7,
          }}
        >
          <strong style={{ color: "var(--primary-text)", fontWeight: 500 }}>
            Notes
          </strong>
          <ul style={{ paddingLeft: 18, marginTop: 6 }}>
            <li>
              In <strong>Docker mode</strong>, the Kali container is
              automatically accessible. The default host is the container name
              (e.g. <code>kali</code>) with port <code>4242</code>.
            </li>
            <li>
              In <strong>Developer mode</strong>, point this to your local
              exploit box or VM (typically <code>localhost</code>).
            </li>
            <li>
              Private key authentication is recommended for production
              deployments.
            </li>
          </ul>
        </div>
      </div>

      <SSHTestTerminalModal
        open={testModalOpen}
        onClose={() => setTestModalOpen(false)}
      />
    </div>
  );
};

export default SSHPage;
