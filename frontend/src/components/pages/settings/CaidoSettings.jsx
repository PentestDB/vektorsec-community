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
import { useTranslation } from "@/i18n/I18nProvider";
import styles from "@/styles/pages/Settings.module.scss";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { getCaidoConfig, updateCaidoConfig } from "@/services/user.service";
import { getCaidoConnectionStatus } from "@/services/caido.service";

/**
 * Render `backticked` spans of a translated string as inline <code> elements,
 * so translators keep the command names inside the sentence they translate.
 */
const renderWithCode = (text) =>
  text
    .split("`")
    .map((part, index) =>
      index % 2 === 1 ? <code key={index}>{part}</code> : part,
    );

const CaidoSettingsPage = () => {
  const { t } = useTranslation();
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
      message.success(t("caidoSettings.saved"));
      queryClient.invalidateQueries("caido-config");
      queryClient.invalidateQueries("caido-connection-status");
      setSaving(false);
      form.setFieldsValue({ pat: "" });
    },
    onError: (err) => {
      message.error(
        err?.response?.data?.message || t("caidoSettings.saveFailed"),
      );
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
          ? result.viewer?.id
            ? t("caidoSettings.connectedAs", { id: result.viewer.id })
            : t("caidoSettings.connected")
          : result.message || t("caidoSettings.connectionFailed"),
      });
    } catch (err) {
      setTestResult({
        success: false,
        message:
          err?.response?.data?.message || t("caidoSettings.connectionFailed"),
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
            {t("caidoSettings.configured")}
          </Tag>
        ) : (
          <Tag icon={<WarningOutlined />} color="warning">
            {t("caidoSettings.notConfigured")}
          </Tag>
        )}
        {data?.patConfigured && (
          <Tag icon={<KeyOutlined />} color="blue">
            {t("caidoSettings.patSaved")}
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
            {t("caidoSettings.testConnection")}
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
          label={t("caidoSettings.urlLabel")}
          name="url"
          rules={[{ required: true, message: t("caidoSettings.urlRequired") }]}
        >
          <Input placeholder="http://192.168.160.1:8096" />
        </Form.Item>

        <Row gutter={16}>
          <Col span={14}>
            <Form.Item
              label={t("caidoSettings.patLabel")}
              name="pat"
            >
              <Input.Password
                placeholder={
                  data?.patConfigured
                    ? t("caidoSettings.patPlaceholderKeep")
                    : "caido_..."
                }
              />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item
              label={t("caidoSettings.proxyUrlLabel")}
              name="proxyUrl"
            >
              <Input placeholder={t("caidoSettings.proxyUrlPlaceholder")} />
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
            {t("caidoSettings.saveConfig")}
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
          {t("caidoSettings.setupGuide")}
        </div>
        <div style={{ fontSize: "0.75rem", color: "var(--secondary-text)", lineHeight: 1.7 }}>
          <div style={{ marginBottom: "0.6rem" }}>
            <strong>{t("caidoSettings.guideWslTitle")}</strong>{" "}
            {renderWithCode(t("caidoSettings.guideWsl"))}
          </div>
          <div style={{ marginBottom: "0.6rem" }}>
            <strong>{t("caidoSettings.guideServerTitle")}</strong>{" "}
            {renderWithCode(t("caidoSettings.guideServer"))}
          </div>
          <div>
            <strong>{t("caidoSettings.guideHeadlessTitle")}</strong>{" "}
            {renderWithCode(t("caidoSettings.guideHeadless"))}
          </div>
        </div>
      </div>

      <div className={styles.notesSection} style={{ marginTop: "1rem" }}>
        <ul>
          <li>{t("caidoSettings.notesHistory")}</li>
          <li>{t("caidoSettings.notesProxy")}</li>
        </ul>
      </div>
    </div>
  );
};

export default CaidoSettingsPage;
