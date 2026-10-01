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
import RichText from "@/components/common/RichText";
import { useTranslation } from "@/i18n/I18nProvider";
import styles from "@/styles/pages/Settings.module.scss";
import { useMutation, useQuery, useQueryClient } from "react-query";
import {
  getMythicConfig,
  updateMythicConfig,
  getMythicConnectionStatus,
} from "@/services/mythic.service";

const MythicSettingsPage = () => {
  const { t } = useTranslation();
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
      message.success(t("mythicSettings.saved"));
      queryClient.invalidateQueries("mythic-config");
      queryClient.invalidateQueries("mythic-connection-status");
      setSaving(false);
      form.setFieldsValue({ token: "" });
    },
    onError: (err) => {
      message.error(
        err?.response?.data?.message || t("common.saveConfigurationFailed"),
      );
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
          ? t("mythicSettings.testSuccess", {
              status: result.operation
                ? t("mythicSettings.connectedToOperation", {
                    operation: result.operation,
                  })
                : t("common.connected"),
              callbacks: t("mythicSettings.callbacksVisible", {
                count: result.callbackCount ?? 0,
              }),
            })
          : result.error || t("common.connectionFailed"),
      });
    } catch (err) {
      setTestResult({
        success: false,
        message:
          err?.response?.data?.message || t("common.connectionFailed"),
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
        {data?.tokenConfigured && (
          <Tag icon={<KeyOutlined />} color="blue">
            {t("mythicSettings.tokenSaved")}
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
          label={t("mythicSettings.urlLabel")}
          name="url"
          rules={[{ required: true, message: t("common.urlRequired") }]}
        >
          <Input placeholder="https://10.0.0.5:7443" />
        </Form.Item>

        <Form.Item label={t("mythicSettings.tokenLabel")} name="token">
          <Input.Password
            placeholder={
              data?.tokenConfigured
                ? t("mythicSettings.tokenPlaceholderKeep")
                : "mtk_..."
            }
          />
        </Form.Item>

        <Form.Item
          label={t("mythicSettings.insecureTlsLabel")}
          name="insecureTls"
          valuePropName="checked"
          extra={t("mythicSettings.insecureTlsHelp")}
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
        <div style={{ fontSize: "0.75rem", color: "var(--secondary-text)", lineHeight: 1.7 }}>
          <div style={{ marginBottom: "0.6rem" }}>
            <strong>{t("mythicSettings.guideStartTitle")}</strong>{" "}
            <RichText text={t("mythicSettings.guideStart")} />
          </div>
          <div style={{ marginBottom: "0.6rem" }}>
            <strong>{t("mythicSettings.guideTokenTitle")}</strong>{" "}
            <RichText text={t("mythicSettings.guideToken")} />
          </div>
          <div style={{ marginBottom: "0.6rem" }}>
            <strong>{t("mythicSettings.guideReachTitle")}</strong>{" "}
            <RichText text={t("mythicSettings.guideReach")} />
          </div>
          <div>
            <strong>{t("mythicSettings.guideSchemaTitle")}</strong>{" "}
            <RichText text={t("mythicSettings.guideSchema")} />
          </div>
        </div>
      </div>

      <div className={styles.notesSection} style={{ marginTop: "1rem" }}>
        <ul>
          <li>{t("mythicSettings.notesData")}</li>
          <li>{t("mythicSettings.notesApproval")}</li>
          <li>{t("mythicSettings.notesCallbacks")}</li>
        </ul>
      </div>
    </div>
  );
};

export default MythicSettingsPage;
