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
  PlusOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { TbTerminal2 } from "react-icons/tb";
import PrimaryButton from "@/components/common/PrimaryButton";
import Loader from "@/components/common/loader/Loader";
import RichText from "@/components/common/RichText";
import { useTranslation } from "@/i18n/I18nProvider";
import styles from "@/styles/pages/Settings.module.scss";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { getSSHConfig, updateSSHConfig, updateSafetyProtections, getSSHProfiles, addSSHProfile, deleteSSHProfile, testSSHProfile, testSavedSSHProfile } from "@/services/user.service";
import { apiClient } from "@/utils/axios.config";

const SSHPage = () => {
  const { t } = useTranslation();
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
          ? t("sshSettings.safetyDisabled")
          : t("sshSettings.safetyEnabled"),
      );
    },
    onError: (err) => {
      setSafetyDisabled(!safetyDisabled);
      message.error(
        err?.response?.data?.message || t("sshSettings.safetyUpdateFailed"),
      );
    },
  });

  const saveMutation = useMutation(updateSSHConfig, {
    onSuccess: () => {
      message.success(t("sshSettings.saved"));
      queryClient.invalidateQueries("ssh-config");
      setSaving(false);
    },
    onError: (err) => {
      message.error(err?.response?.data?.message || t("sshSettings.saveFailed"));
      setSaving(false);
    },
  });

  // Managed SSH servers (multiple profiles).
  const { data: managedProfiles, isLoading: profilesLoading } = useQuery(
    "managed-ssh-profiles",
    getSSHProfiles,
  );
  const [profileForm] = Form.useForm();

  const addProfileMutation = useMutation(addSSHProfile, {
    onSuccess: () => {
      message.success(t("sshSettings.serverAdded"));
      profileForm.resetFields();
      queryClient.invalidateQueries("managed-ssh-profiles");
    },
    onError: (err) =>
      message.error(
        err?.response?.data?.message || t("sshSettings.serverAddFailed"),
      ),
  });

  const deleteProfileMutation = useMutation(deleteSSHProfile, {
    onSuccess: () => {
      message.success(t("sshSettings.serverRemoved"));
      queryClient.invalidateQueries("managed-ssh-profiles");
    },
    onError: (err) =>
      message.error(
        err?.response?.data?.message || t("sshSettings.serverRemoveFailed"),
      ),
  });

  // Test connection for the in-progress form (BEFORE saving).
  const [testingProfile, setTestingProfile] = useState(false);
  const testProfileMutation = useMutation(testSSHProfile, {
    onMutate: () => setTestingProfile(true),
    onSuccess: (res) => {
      if (res?.success) {
        message.success(res.message || t("sshSettings.testSuccess"));
      } else {
        message.error(res?.message || t("sshSettings.testFailed"));
      }
    },
    onError: (err) =>
      message.error(err?.response?.data?.message || t("sshSettings.testFailed")),
    onSettled: () => setTestingProfile(false),
  });

  // Test an already-saved managed profile (per-row button).
  const [testingAlias, setTestingAlias] = useState(null);
  const testSavedMutation = useMutation(testSavedSSHProfile, {
    onMutate: (alias) => setTestingAlias(alias),
    onSuccess: (res) => {
      if (res?.success) {
        message.success(res.message || t("sshSettings.testSuccess"));
      } else {
        message.error(res?.message || t("sshSettings.testFailed"));
      }
    },
    onError: (err) =>
      message.error(err?.response?.data?.message || t("sshSettings.testFailed")),
    onSettled: () => setTestingAlias(null),
  });

  const handleTestProfile = async () => {
    try {
      // Runs the same required-field rules as "Add Server".
      const values = await profileForm.validateFields();
      testProfileMutation.mutate(values);
    } catch {
      // antd renders the inline validation errors already.
    }
  };

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
        message={t("sshSettings.legacyTitle")}
        description={t("sshSettings.legacyBody")}
      />
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
            icon={<TbTerminal2 />}
            loading={testingSSH}
            onClick={async () => {
              setTestingSSH(true);
              try {
                const { data: res } = await apiClient.post("/shell/test-ssh");
                if (res.success) {
                  message.success(res.message);
                } else {
                  message.error(res.message || t("sshSettings.testFailed"));
                }
              } catch (err) {
                message.error(
                  err?.response?.data?.message || t("sshSettings.testFailed"),
                );
              } finally {
                setTestingSSH(false);
              }
            }}
          >
            {t("sshSettings.testConnectivity")}
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
              label={t("sshSettings.hostLabel")}
              name="host"
              rules={[
                { required: true, message: t("sshSettings.hostRequired") },
              ]}
            >
              <Input placeholder={t("sshSettings.hostPlaceholder")} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label={t("common.portLabel")}
              name="port"
              rules={[
                { required: true, message: t("common.portRequired") },
              ]}
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
          label={t("sshSettings.usernameLabel")}
          name="username"
          rules={[
            { required: true, message: t("sshSettings.usernameRequired") },
          ]}
        >
          <Input placeholder={t("sshSettings.usernamePlaceholder")} />
        </Form.Item>

        <Divider style={{ borderColor: "var(--border-color-100)", margin: "0.5rem 0 1rem" }} />

        <Form.Item
          label={
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {t("sshSettings.authMethodLabel")}
              <Tooltip title={t("sshSettings.authMethodTooltip")}>
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
              <span style={{ color: "var(--primary-text)", fontSize: "0.78rem" }}>
                {t("sshSettings.passwordOption")}
              </span>
            </Radio>
            <Radio value="key">
              <span style={{ color: "var(--primary-text)", fontSize: "0.78rem" }}>
                {t("sshSettings.keyOption")}
              </span>
            </Radio>
          </Radio.Group>
        </Form.Item>

        {authMethod === "password" ? (
          <Form.Item
            label={t("sshSettings.passwordLabel")}
            name="password"
            extra={
              data?.password ? (
                <span className={styles.fieldHint}>
                  {t("sshSettings.passwordHint")}
                </span>
              ) : null
            }
          >
            <Input.Password
              placeholder={
                data?.password
                  ? "••••••••"
                  : t("sshSettings.passwordPlaceholder")
              }
            />
          </Form.Item>
        ) : (
          <>
            <Form.Item
              label={
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {t("sshSettings.keyPathLabel")}
                  <Tooltip title={t("sshSettings.keyPathTooltip")}>
                    <InfoCircleOutlined style={{ color: "var(--secondary-text)", fontSize: "0.7rem" }} />
                  </Tooltip>
                </span>
              }
              name="privateKeyPath"
              extra={
                data?.hasPrivateKey ? (
                  <span className={styles.fieldHint}>
                    {t("sshSettings.keyPathHint")}
                  </span>
                ) : null
              }
            >
              <Input placeholder={t("sshSettings.keyPathPlaceholder")} />
            </Form.Item>
            <Form.Item
              label={t("sshSettings.passphraseLabel")}
              name="passphrase"
            >
              <Input.Password placeholder={t("sshSettings.passphrasePlaceholder")} />
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
            {t("common.saveConfiguration")}
          </PrimaryButton>
        </div>
      </Form>

      <Divider style={{ borderColor: "var(--border-color-100)", margin: "1.25rem 0 0.75rem" }} />

      <div className={styles.safetySection}>
        <div className={styles.safetySectionHeader}>
          <div>
            <div className={styles.safetySectionTitle}>
              <WarningOutlined style={{ color: safetyDisabled ? "#ff4d4f" : "var(--secondary-text)" }} />
              {t("sshSettings.safetyTitle")}
            </div>
            <div className={styles.safetySectionDesc}>
              <RichText text={t("sshSettings.safetyDesc")} />
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
            <RichText text={t("sshSettings.notesDocker")} />
          </li>
          <li>
            <RichText text={t("sshSettings.notesDev")} />
          </li>
          <li>{t("sshSettings.notesKey")}</li>
        </ul>
      </div>

      <Divider style={{ borderColor: "var(--border-color-100)", margin: "1.25rem 0 0.75rem" }} />

      <div className={styles.safetySection}>
        <div className={styles.safetySectionHeader}>
          <div>
            <div className={styles.safetySectionTitle}>
              <TbTerminal2 style={{ marginRight: 6 }} /> {t("sshSettings.serversTitle")}
            </div>
            <div className={styles.safetySectionDesc}>
              {t("sshSettings.serversDesc")}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {(managedProfiles?.profiles ?? []).map((profile) => (
            <div
              key={profile.alias}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 6,
                background: "rgba(255, 255, 255, 0.02)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#e6edf3" }}>
                  {profile.label || profile.alias}
                  {profile.available ? (
                    <CheckCircleFilled style={{ color: "#10ca00", marginLeft: 8, fontSize: 11 }} />
                  ) : (
                    <WarningOutlined style={{ color: "#ff3e3e", marginLeft: 8, fontSize: 11 }} />
                  )}
                </div>
                <div style={{ fontSize: 11, color: "#a1a1a1" }}>
                  {profile.username}@{profile.host}:{profile.port}
                  {!profile.available && profile.error ? ` — ${profile.error}` : ""}
                </div>
              </div>
              <Button
                size="small"
                icon={<TbTerminal2 />}
                loading={testingAlias === profile.alias}
                onClick={() => testSavedMutation.mutate(profile.alias)}
              >
                {t("common.test")}
              </Button>
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                loading={
                  deleteProfileMutation.isLoading &&
                  deleteProfileMutation.variables === profile.alias
                }
                onClick={() => deleteProfileMutation.mutate(profile.alias)}
              >
                {t("common.remove")}
              </Button>
            </div>
          ))}
          {(managedProfiles?.profiles ?? []).length === 0 && !profilesLoading && (
            <div style={{ fontSize: 12, color: "#6d6d6d" }}>
              {t("sshSettings.noServers")}
            </div>
          )}
        </div>

        <Form
          form={profileForm}
          layout="vertical"
          onFinish={(values) => addProfileMutation.mutate(values)}
          style={{ marginTop: 12 }}
        >
          <Row gutter={8}>
            <Col span={8}>
              <Form.Item
                name="alias"
                label={t("sshSettings.nameLabel")}
                rules={[{ required: true, message: t("common.required") }]}
              >
                <Input placeholder={t("sshSettings.namePlaceholder")} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="label" label={t("sshSettings.labelLabel")}>
                <Input placeholder={t("sshSettings.labelPlaceholder")} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="username"
                label={t("sshSettings.usernameLabel")}
                rules={[{ required: true, message: t("common.required") }]}
              >
                <Input placeholder="root" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={8}>
            <Col span={8}>
              <Form.Item
                name="host"
                label={t("sshSettings.hostLabel")}
                rules={[{ required: true, message: t("common.required") }]}
              >
                <Input placeholder="<YOUR_VPS_IP> or example.com" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="port" label={t("common.portLabel")} initialValue={22}>
                <InputNumber min={1} max={65535} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="password" label={t("sshSettings.passwordLabel")}>
                <Input.Password
                  placeholder={t("sshSettings.passwordPlaceholderProfile")}
                  autoComplete="new-password"
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={8} align="middle">
            <Col span={16}>
              <Form.Item
                name="privateKeyPath"
                label={t("sshSettings.keyPathOptionalLabel")}
              >
                <Input placeholder="/root/.ssh/id_rsa" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <div style={{ display: "flex", alignItems: "flex-end", height: "100%", paddingBottom: 24, gap: 8 }}>
                <Button
                  onClick={handleTestProfile}
                  loading={testingProfile}
                  style={{ height: "2rem", fontSize: "0.75rem" }}
                >
                  {t("common.test")}
                </Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<PlusOutlined />}
                  loading={addProfileMutation.isLoading}
                  style={{ height: "2rem", fontSize: "0.75rem" }}
                >
                  {t("sshSettings.addServer")}
                </Button>
              </div>
            </Col>
          </Row>
        </Form>
      </div>

    </div>
  );
};

export default SSHPage;
