"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Form,
  Input,
  Select,
  AutoComplete,
  Switch,
  Row,
  Col,
  Tag,
  message,
  Divider,
  Tooltip,
} from "antd";
import {
  CheckCircleFilled,
  InfoCircleOutlined,
  WarningOutlined,
  LoadingOutlined,
  ExportOutlined,
} from "@ant-design/icons";
import PrimaryButton from "@/components/common/PrimaryButton";
import Loader from "@/components/common/loader/Loader";
import styles from "@/styles/pages/Settings.module.scss";
import { useMutation, useQuery, useQueryClient } from "react-query";
import {
  getMagnitudeConfig,
  updateMagnitudeConfig,
  startMagnitudeAgent,
  getAvailableModels,
} from "@/services/user.service";

const PROVIDER_META = {
  openai: {
    label: "OpenAI",
    placeholder: "sk-...",
    keyURL: "https://platform.openai.com/api-keys",
    keyLabel: "Get OpenAI API Key",
  },
  anthropic: {
    label: "Anthropic (Claude)",
    placeholder: "sk-ant-...",
    keyURL: "https://console.anthropic.com/settings/keys",
    keyLabel: "Get Claude API Key",
  },
  google: {
    label: "Google",
    placeholder: "AI...",
    keyURL: "https://aistudio.google.com/apikey",
    keyLabel: "Get Google AI API Key",
  },
  mistralai: {
    label: "Mistral AI",
    placeholder: "API key",
    keyURL: "https://console.mistral.ai/api-keys",
    keyLabel: "Get Mistral API Key",
  },
};

const FALLBACK_PROVIDERS = [
  { value: "openai", label: "OpenAI", models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1", "o3-mini"] },
  { value: "anthropic", label: "Anthropic (Claude)", models: ["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"] },
];

const OPENAI_COMPATIBLE_ENTRY = {
  value: "openai-compatible",
  label: "OpenAI-Compatible",
  models: [],
};

function buildProviders(catalog) {
  if (!catalog?.providers?.length) {
    return [
      ...FALLBACK_PROVIDERS.map((fb) => ({ ...fb, ...(PROVIDER_META[fb.value] || {}) })),
      OPENAI_COMPATIBLE_ENTRY,
    ];
  }
  const providers = catalog.providers.map((cp) => {
    const meta = PROVIDER_META[cp.id] || {};
    return {
      value: cp.id,
      label: meta.label || cp.name,
      models: cp.models.map((m) => m.modelId),
      placeholder: meta.placeholder || "API key",
      keyURL: meta.keyURL || null,
      keyLabel: meta.keyLabel || null,
    };
  });
  providers.push(OPENAI_COMPATIBLE_ENTRY);
  return providers;
}

const MagnitudeSettingsPage = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery("magnitude-config", getMagnitudeConfig);
  const { data: catalog } = useQuery("available-models", getAvailableModels, {
    staleTime: 6 * 60 * 60 * 1000,
    cacheTime: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const [form] = Form.useForm();
  const [modelForm] = Form.useForm();
  const [goalForm] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);

  const providers = useMemo(() => buildProviders(catalog), [catalog]);
  const modelProvider = Form.useWatch("modelProvider", modelForm);
  const providerDef = providers.find((p) => p.value === modelProvider);

  useEffect(() => {
    if (data) {
      form.setFieldsValue({
        enabled: data.enabled,
        proxyUrl: data.proxyUrl,
        headless: data.headless,
        displayPort: data.displayPort,
      });
      modelForm.setFieldsValue({
        modelProvider: data.modelProvider || "openai",
        model: data.model || undefined,
        apiKey: data.apiKey || "",
        baseURL: data.baseURL || "",
      });
    }
  }, [data, form, modelForm]);

  const saveMutation = useMutation(updateMagnitudeConfig, {
    onSuccess: () => {
      message.success("Magnitude configuration saved");
      queryClient.invalidateQueries("magnitude-config");
      setSaving(false);
    },
    onError: (err) => {
      message.error(err?.response?.data?.message || "Failed to save Magnitude config");
      setSaving(false);
    },
  });

  const saveModelMutation = useMutation(updateMagnitudeConfig, {
    onSuccess: () => {
      message.success("Browser Agent model saved");
      queryClient.invalidateQueries("magnitude-config");
      setSavingModel(false);
    },
    onError: (err) => {
      message.error(err?.response?.data?.message || "Failed to save model config");
      setSavingModel(false);
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

  const handleSaveModel = (values) => {
    setSavingModel(true);
    saveModelMutation.mutate({
      enabled: form.getFieldValue("enabled"),
      proxyUrl: form.getFieldValue("proxyUrl") || "",
      headless: form.getFieldValue("headless"),
      displayPort: form.getFieldValue("displayPort") || "",
      useOwnModel: true,
      modelProvider: values.modelProvider,
      model: values.model,
      apiKey: values.apiKey,
      baseURL: values.baseURL || "",
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
  const modelConfigured = !!(data?.modelProvider && data?.apiKey);

  return (
    <div className={styles.settingsContainer}>
      <div className={styles.statusRow}>
        {configured ? (
          <Tag icon={<CheckCircleFilled />} color="success">Enabled</Tag>
        ) : (
          <Tag icon={<WarningOutlined />} color="warning">Disabled</Tag>
        )}
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
              <Tooltip title="Route browser traffic through a proxy (e.g. Burp Suite). Use format http://host:port or socks5://host:port">
                <InfoCircleOutlined style={{ color: "var(--secondary-text)", fontSize: "0.7rem" }} />
              </Tooltip>
            </span>
          }
          name="proxyUrl"
        >
          <Input placeholder="e.g. http://127.0.0.1:8080 or socks5://proxy:1080" />
        </Form.Item>

        <Form.Item
          label={
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              Headless Mode
              <Tooltip title="Run the browser without a visible window. Disable to watch the browser on your VNC/X display.">
                <InfoCircleOutlined style={{ color: "var(--secondary-text)", fontSize: "0.7rem" }} />
              </Tooltip>
            </span>
          }
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
              <Form.Item
                label={
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    X Display
                    <Tooltip title="The X11 DISPLAY to render the browser on (e.g. :99 for a VNC server on display 99). Required when headless is off on a server without a physical display.">
                      <InfoCircleOutlined style={{ color: "var(--secondary-text)", fontSize: "0.7rem" }} />
                    </Tooltip>
                  </span>
                }
                name="displayPort"
              >
                <Input placeholder="e.g. :99 or :1" />
              </Form.Item>
            )
          }
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

      <Divider style={{ borderColor: "var(--border-color-100)", margin: "1.25rem 0" }} />

      <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--primary-text)", marginBottom: "0.75rem" }}>
        Browser Agent Model
      </div>

      <div className={styles.infoBox} style={{ marginBottom: "1rem" }}>
        <InfoCircleOutlined />
        <span>
          Configure the model and API key used by the browser agent. This is independent of the main copilot model.
        </span>
      </div>

      <Form
        form={modelForm}
        layout="vertical"
        onFinish={handleSaveModel}
        initialValues={{
          modelProvider: data?.modelProvider || "openai",
          model: data?.model || undefined,
          apiKey: data?.apiKey || "",
          baseURL: data?.baseURL || "",
        }}
        requiredMark={false}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="modelProvider" label="Provider" rules={[{ required: true }]}>
              <Select
                showSearch
                options={providers.map((p) => ({ value: p.value, label: p.label }))}
                popupMatchSelectWidth={false}
                filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
                onChange={() => {
                  modelForm.setFieldValue("model", undefined);
                  modelForm.setFieldValue("apiKey", "");
                  modelForm.setFieldValue("baseURL", "");
                }}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="model" label="Model" rules={[{ required: true, message: "Model is required" }]}>
              <AutoComplete
                allowClear
                placeholder={providerDef?.models?.length ? "Select or type a model" : "e.g. llama-3.1-70b-versatile"}
                options={(providerDef?.models || []).map((m) => ({ value: m, label: m }))}
                popupMatchSelectWidth={false}
                filterOption={(input, option) => option.value.toLowerCase().includes(input.toLowerCase())}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={modelProvider === "openai-compatible" ? 12 : 24}>
            <Form.Item name="apiKey" label="API Key" rules={[{ required: true, message: "API key is required" }]}>
              <Input type="password" autoComplete="off" placeholder={providerDef?.placeholder || "API key"} />
            </Form.Item>
          </Col>
          {modelProvider === "openai-compatible" && (
            <Col span={12}>
              <Form.Item
                name="baseURL"
                label={
                  <span>
                    Base URL{" "}
                    <Tooltip title="e.g. https://api.groq.com/openai/v1">
                      <InfoCircleOutlined style={{ color: "var(--secondary-text)", fontSize: 11 }} />
                    </Tooltip>
                  </span>
                }
                rules={[{ required: true, message: "Base URL is required" }]}
              >
                <Input placeholder="https://api.groq.com/openai/v1" />
              </Form.Item>
            </Col>
          )}
        </Row>

        <Row justify="space-between" align="middle" style={{ marginTop: 4 }}>
          <Col>
            {providerDef?.keyURL && (
              <a
                href={providerDef.keyURL}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.externalLink}
              >
                <ExportOutlined style={{ fontSize: 11 }} />
                {providerDef.keyLabel}
              </a>
            )}
          </Col>
          <Col>
            <PrimaryButton
              purple
              htmlType="submit"
              loading={savingModel}
              style={{ height: "2rem", fontSize: "0.75rem" }}
            >
              Save Model
            </PrimaryButton>
          </Col>
        </Row>
      </Form>

      {configured && (
        <>
          <Divider style={{ borderColor: "var(--border-color-100)", margin: "1.25rem 0" }} />

          <div style={{
            fontSize: "0.78rem",
            fontWeight: 600,
            color: "var(--primary-text)",
            marginBottom: "0.75rem",
          }}>
            Quick Test — Run Browser Agent
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

          <Form
            form={goalForm}
            layout="vertical"
          >
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

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
              <PrimaryButton
                onClick={handleStartAgent}
                loading={running}
                purple
                style={{ height: "2rem", fontSize: "0.75rem" }}
                disabled={!modelConfigured}
              >
                {running ? (
                  <><LoadingOutlined style={{ marginRight: 6 }} /> Running Agent...</>
                ) : (
                  "Run Browser Agent"
                )}
              </PrimaryButton>
            </div>
          </Form>
        </>
      )}

      <Divider style={{ borderColor: "var(--border-color-100)", margin: "1.25rem 0 0.75rem" }} />

      <div className={styles.notesSection}>
        <ul>
          <li>
            Magnitude enables <strong>agentic browser automation</strong> for penetration testing —
            the AI can navigate web apps, fill forms, click buttons, and extract data.
          </li>
          <li>
            The browser agent uses its own <strong>model and API key</strong> configured above,
            independent of the main copilot model. Supports OpenAI and Anthropic providers.
          </li>
          <li>
            Set a <strong>proxy URL</strong> to route browser traffic through Burp Suite or
            another intercepting proxy for full visibility.
          </li>
          <li>
            During a pentest session, the AI can invoke the <code>browser_action</code> tool
            to autonomously interact with target web applications.
          </li>
          <li>
            Disable <strong>headless mode</strong> to watch the browser in real time. On a VM
            or server, set the <strong>X Display</strong> to your VNC display (e.g. <code>:99</code>)
            so the browser renders on the VNC session.
          </li>
        </ul>
      </div>
    </div>
  );
};

export default MagnitudeSettingsPage;
