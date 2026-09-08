"use client";

import { useEffect, useState } from "react";
import {
  App,
  Col,
  Divider,
  Form,
  Input,
  Row,
  Switch,
  Tag,
  Tooltip,
} from "antd";
import {
  CheckCircleFilled,
  InfoCircleOutlined,
  LoadingOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import PrimaryButton from "@/components/common/PrimaryButton";
import Loader from "@/components/common/loader/Loader";
import styles from "@/styles/pages/Settings.module.scss";
import { useMutation, useQuery, useQueryClient } from "react-query";
import {
  getMagnitudeConfig,
  startMagnitudeAgent,
  updateMagnitudeConfig,
} from "@/services/user.service";
import { getMagnitudeModelIssue } from "@/utils/magnitudeModels";

const MagnitudeSettingsPage = ({ onNavigate }) => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery("magnitude-config", getMagnitudeConfig);

  const [form] = Form.useForm();
  const [goalForm] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);

  useEffect(() => {
    if (data) {
      form.setFieldsValue({
        enabled: data.enabled,
        proxyUrl: data.proxyUrl,
        headless: data.headless,
        displayPort: data.displayPort,
      });
    }
  }, [data, form]);

  const saveMutation = useMutation(updateMagnitudeConfig, {
    onSuccess: () => {
      message.success("Browser Agent configuration saved");
      queryClient.invalidateQueries("magnitude-config");
      setSaving(false);
    },
    onError: (err) => {
      message.error(
        err?.response?.data?.message || "Failed to save Browser Agent config",
      );
      setSaving(false);
    },
  });

  const onFinish = (values) => {
    setSaving(true);
    saveMutation.mutate({
      enabled: values.enabled,
      proxyUrl: values.proxyUrl || "",
      headless: values.headless,
      displayPort: values.displayPort || "",
    });
  };

  const handleStartAgent = async () => {
    try {
      const values = await goalForm.validateFields();
      setRunning(true);
      setRunResult(null);
      const result = await startMagnitudeAgent({
        goal: values.goal,
        targetUrl: values.targetUrl,
      });
      setRunResult({ success: true, message: result.message });
    } catch (err) {
      if (err?.errorFields) return;
      setRunResult({
        success: false,
        message: err?.response?.data?.message || "Failed to run browser agent",
      });
    } finally {
      setRunning(false);
    }
  };

  if (isLoading) return <Loader />;

  const configured = data?.configured;
  const selectedModel = data?.browserModel || null;
  const browserModelIssue = selectedModel
    ? getMagnitudeModelIssue(selectedModel)
    : null;
  const canRunBrowserAgent = configured && selectedModel && !browserModelIssue;

  return (
    <div className={styles.settingsContainer}>
      <div className={styles.statusRow}>
        {configured ? (
          <Tag icon={<CheckCircleFilled />} color="success">
            Enabled
          </Tag>
        ) : (
          <Tag icon={<WarningOutlined />} color="warning">
            Disabled
          </Tag>
        )}
        {selectedModel ? (
          <Tag color={browserModelIssue ? "warning" : "blue"}>
            {selectedModel.label}
          </Tag>
        ) : (
          <Tag color="warning">No model selected</Tag>
        )}
      </div>

      <div className={styles.warningBox}>
        <WarningOutlined />
        <span>
          Browser Agent requires a Magnitude-compatible model. For MiniMax, use
          an <strong>OpenAI-Compatible</strong> preset with base URL{" "}
          <code>https://api.minimax.io/v1</code>. Incompatible presets are
          hidden from the Browser Agent dropdown in Settings &gt; Models.
        </span>
      </div>

      {browserModelIssue && (
        <div className={styles.errorBox}>
          <WarningOutlined />
          <span>{browserModelIssue}</span>
        </div>
      )}

      <div className={styles.infoBox}>
        <InfoCircleOutlined />
        <span>
          Browser Agent uses the model selected in Settings &gt; Models.
          Configure credentials and assignments there once.
        </span>
      </div>

      <div className={styles.mcpPanel}>
        <div className={styles.mcpPanelHeader} style={{ marginBottom: 0 }}>
          <div>
            <div className={styles.mcpPanelTitle}>Browser Model</div>
            <div className={styles.mcpPanelDescription}>
              {selectedModel
                ? `${selectedModel.label} · ${selectedModel.provider}/${selectedModel.model}`
                : "No Browser Agent model is assigned yet."}
            </div>
          </div>
          <PrimaryButton
            onClick={() => onNavigate?.("models")}
            style={{ height: "1.85rem", fontSize: "0.72rem" }}
          >
            Open Models
          </PrimaryButton>
        </div>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{
          enabled: data?.enabled || false,
          proxyUrl: data?.proxyUrl || "",
          headless: data?.headless !== false,
          displayPort: data?.displayPort || "",
        }}
      >
        <Form.Item
          label="Enable Magnitude Browser Agent"
          name="enabled"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>

        <Form.Item
          label={
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              Proxy URL
              <Tooltip title="Route browser traffic through a proxy such as Burp Suite. Use http://host:port or socks5://host:port.">
                <InfoCircleOutlined
                  style={{ color: "var(--secondary-text)", fontSize: "0.7rem" }}
                />
              </Tooltip>
            </span>
          }
          name="proxyUrl"
        >
          <Input placeholder="e.g. http://127.0.0.1:8081" />
        </Form.Item>

        <Form.Item
          label="Headless Mode"
          name="headless"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>

        <Form.Item
          noStyle
          shouldUpdate={(prev, cur) => prev.headless !== cur.headless}
        >
          {({ getFieldValue }) =>
            !getFieldValue("headless") && (
              <Form.Item label="X Display" name="displayPort">
                <Input placeholder="e.g. :99 or :1" />
              </Form.Item>
            )
          }
        </Form.Item>

        <div
          style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}
        >
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

      {canRunBrowserAgent && (
        <>
          <Divider
            style={{
              borderColor: "var(--border-color-100)",
              margin: "1.25rem 0",
            }}
          />

          <div
            style={{
              fontSize: "0.78rem",
              fontWeight: 600,
              color: "var(--primary-text)",
              marginBottom: "0.75rem",
            }}
          >
            Quick Test
          </div>

          {runResult && (
            <div
              style={{
                padding: "0.5rem 0.75rem",
                marginBottom: "1rem",
                borderRadius: 6,
                fontSize: "0.78rem",
                background: runResult.success
                  ? "rgba(126, 231, 135, 0.1)"
                  : "rgba(255, 62, 62, 0.1)",
                border: `1px solid ${runResult.success ? "rgba(126, 231, 135, 0.3)" : "rgba(255, 62, 62, 0.3)"}`,
                color: runResult.success ? "#7ee787" : "#ff6b6b",
              }}
            >
              {runResult.message}
            </div>
          )}

          <Form form={goalForm} layout="vertical">
            <Form.Item
              label="Target URL"
              name="targetUrl"
              rules={[{ required: true, message: "A target URL is required" }]}
            >
              <Input placeholder="e.g. https://target-app.com/login" />
            </Form.Item>

            <Form.Item
              label="Goal"
              name="goal"
              rules={[{ required: true, message: "A goal is required" }]}
            >
              <Input.TextArea
                rows={3}
                placeholder="e.g. Log in with admin/admin and navigate to the admin panel"
              />
            </Form.Item>

            <Row justify="end">
              <Col>
                <PrimaryButton
                  purple
                  onClick={handleStartAgent}
                  loading={running}
                  disabled={!selectedModel}
                  style={{ height: "2rem", fontSize: "0.75rem" }}
                >
                  {running ? <LoadingOutlined /> : null}
                  Run Test
                </PrimaryButton>
              </Col>
            </Row>
          </Form>
        </>
      )}
    </div>
  );
};

export default MagnitudeSettingsPage;
