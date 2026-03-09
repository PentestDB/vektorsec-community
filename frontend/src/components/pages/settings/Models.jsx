"use client";

import { useState } from "react";
import {
  Form,
  Input,
  Select,
  AutoComplete,
  Row,
  Col,
  Tag,
  message,
  notification,
  Tooltip,
  Popconfirm,
  Divider,
  Modal,
  Radio,
} from "antd";
import {
  CheckCircleFilled,
  DeleteOutlined,
  InfoCircleOutlined,
  ExportOutlined,
  ApiOutlined,
  DisconnectOutlined,
  LinkOutlined,
} from "@ant-design/icons";
import PrimaryButton from "@/components/common/PrimaryButton";
import Loader from "@/components/common/loader/Loader";
import styles from "@/styles/pages/Settings.module.scss";
import { useMutation, useQuery, useQueryClient } from "react-query";
import {
  getModelConfig,
  updateModelConfig,
  deleteModelConfig,
  initiateAnthropicOAuth,
  exchangeAnthropicOAuth,
  disconnectAnthropicOAuth,
} from "@/services/user.service";

const PROVIDERS = [
  {
    value: "openai",
    label: "OpenAI",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo", "o1", "o1-mini", "o3-mini"],
    placeholder: "sk-...",
    hint: "Uses the OpenAI API directly. Best for GPT-4o and o-series models.",
    keyURL: "https://platform.openai.com/api-keys",
    keyLabel: "Get OpenAI API Key",
    supportsOAuth: false,
  },
  {
    value: "anthropic",
    label: "Anthropic (Claude)",
    models: ["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
    placeholder: "sk-ant-...",
    hint: "Uses Anthropic's API via their OpenAI-compatible endpoint.",
    keyURL: "https://console.anthropic.com/settings/keys",
    keyLabel: "Get Claude API Key",
    supportsOAuth: true,
  },
  {
    value: "openai-compatible",
    label: "OpenAI-Compatible",
    models: [],
    placeholder: "API key",
    hint: "Any provider with an OpenAI-compatible API — Groq, Together, Ollama, vLLM, LiteLLM, OpenRouter.",
    keyURL: null,
    keyLabel: null,
    supportsOAuth: false,
  },
];

const OAuthCodeModal = ({ open, onCancel, onSubmit, loading }) => {
  const [code, setCode] = useState("");

  return (
    <Modal
      title="Paste Authorization Code"
      open={open}
      onCancel={() => { setCode(""); onCancel(); }}
      footer={null}
      width={520}
    >
      <p style={{ color: "var(--secondary-text)", fontSize: "0.78rem", lineHeight: 1.6, margin: "0 0 12px 0" }}>
        After authorizing in your browser, copy the authorization code and paste it below.
      </p>
      <Input.TextArea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Paste the authorization code here..."
        rows={3}
        style={{ fontFamily: "monospace", fontSize: "0.78rem", marginBottom: 16 }}
      />
      <Row justify="end" gutter={8}>
        <Col>
          <PrimaryButton onClick={() => { setCode(""); onCancel(); }} style={{ height: 34, fontSize: "0.78rem" }}>
            Cancel
          </PrimaryButton>
        </Col>
        <Col>
          <PrimaryButton
            purple
            loading={loading}
            disabled={!code.trim()}
            onClick={() => { onSubmit(code.trim()); setCode(""); }}
            style={{ height: 34, fontSize: "0.78rem" }}
          >
            Connect
          </PrimaryButton>
        </Col>
      </Row>
    </Modal>
  );
};

const ModelsPage = () => {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery("model-config", getModelConfig);
  const provider = Form.useWatch("provider", form);
  const [authMethod, setAuthMethod] = useState(data?.authMethod === "oauth" ? "oauth" : "api_key");
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [oauthState, setOauthState] = useState(null);

  const providerDef = PROVIDERS.find((p) => p.value === provider);
  const isAnthropicOAuth = provider === "anthropic" && authMethod === "oauth";
  const isOAuthConnected = data?.oauthConnected && data?.authMethod === "oauth";

  const updateMutation = useMutation(updateModelConfig, {
    onSuccess: () => {
      message.success("Model configuration updated");
      queryClient.invalidateQueries("model-config");
    },
    onError: (err) => {
      notification.error({ message: "Error", description: err?.response?.data?.message ?? "Failed to update" });
    },
  });

  const deleteMutation = useMutation(deleteModelConfig, {
    onSuccess: (res) => {
      message.success(res?.message ?? "Reset to defaults");
      queryClient.invalidateQueries("model-config");
      form.resetFields();
      setAuthMethod("api_key");
    },
  });

  const initOAuthMutation = useMutation(initiateAnthropicOAuth, {
    onSuccess: (res) => {
      setOauthState(res.state);
      window.open(res.authorizationURL, "_blank", "noopener,noreferrer");
      setShowCodeModal(true);
    },
    onError: (err) => {
      notification.error({ message: "OAuth Error", description: err?.response?.data?.message ?? "Failed to initiate OAuth" });
    },
  });

  const exchangeOAuthMutation = useMutation(exchangeAnthropicOAuth, {
    onSuccess: () => {
      message.success("Claude account connected successfully");
      queryClient.invalidateQueries("model-config");
      setShowCodeModal(false);
      setOauthState(null);
    },
    onError: (err) => {
      notification.error({ message: "OAuth Error", description: err?.response?.data?.message ?? "Failed to exchange OAuth code" });
    },
  });

  const disconnectMutation = useMutation(disconnectAnthropicOAuth, {
    onSuccess: () => {
      message.success("Claude OAuth disconnected");
      queryClient.invalidateQueries("model-config");
      setAuthMethod("api_key");
    },
    onError: (err) => {
      notification.error({ message: "Error", description: err?.response?.data?.message ?? "Failed to disconnect OAuth" });
    },
  });

  if (isLoading) return <Loader />;

  const handleSubmit = (values) => {
    updateMutation.mutate({
      provider: values.provider,
      model: values.model,
      apiKey: values.apiKey,
      baseURL: values.baseURL || "",
    });
  };

  return (
    <div className={styles.settingsContainer}>
      <div className={styles.statusRow}>
        {isOAuthConnected ? (
          <Tag color="blue" style={{ margin: 0 }}><ApiOutlined /> Claude Connected</Tag>
        ) : data?.configured ? (
          <Tag color="green" style={{ margin: 0 }}><CheckCircleFilled /> Configured</Tag>
        ) : (
          <Tag style={{ margin: 0, background: "var(--surface-hover)", border: "1px solid var(--border-color-100)", color: "var(--secondary-text)" }}>
            Using Defaults
          </Tag>
        )}
        {(data?.configured || isOAuthConnected) && (
          isOAuthConnected ? (
            <Popconfirm
              title="Disconnect Claude account?"
              description="Removes OAuth tokens. You can reconnect or switch to an API key."
              onConfirm={() => disconnectMutation.mutate({})}
              okText="Disconnect"
              cancelText="Cancel"
            >
              <Tooltip title="Disconnect Claude OAuth">
                <DisconnectOutlined style={{ color: "var(--secondary-text)", fontSize: 14, cursor: "pointer" }} />
              </Tooltip>
            </Popconfirm>
          ) : (
            <Popconfirm
              title="Reset this configuration?"
              description="Will reset to server defaults."
              onConfirm={() => deleteMutation.mutate({})}
              okText="Reset"
              cancelText="Cancel"
            >
              <Tooltip title="Reset to defaults">
                <DeleteOutlined style={{ color: "var(--secondary-text)", fontSize: 14, cursor: "pointer" }} />
              </Tooltip>
            </Popconfirm>
          )
        )}
      </div>

      {isOAuthConnected ? (
        <>
          <div className={styles.infoBox}>
            <ApiOutlined style={{ color: "var(--primary-purple)", fontSize: 13 }} />
            <span>Connected via Claude Account — uses your subscription quota directly.</span>
          </div>

          <Form layout="vertical">
            <Form.Item label="Model">
              <AutoComplete
                value={data?.model}
                style={{ width: "100%" }}
                allowClear
                placeholder="Select or type a model"
                options={PROVIDERS.find((p) => p.value === "anthropic").models.map((m) => ({ value: m, label: m }))}
                popupMatchSelectWidth={false}
                filterOption={(input, option) => option.value.toLowerCase().includes(input.toLowerCase())}
                onChange={(model) => {
                  if (model) {
                    updateMutation.mutate({ provider: "anthropic", model, apiKey: data?.apiKey || "", baseURL: "" });
                  }
                }}
              />
            </Form.Item>
          </Form>
        </>
      ) : (
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            provider: data?.provider || "openai",
            model: data?.model || undefined,
            apiKey: data?.apiKey || "",
            baseURL: data?.baseURL || "",
          }}
          onFinish={handleSubmit}
          requiredMark={false}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="provider" label="Provider" rules={[{ required: true }]}>
                <Select
                  options={PROVIDERS.map((p) => ({ value: p.value, label: p.label }))}
                  popupMatchSelectWidth={false}
                  onChange={() => {
                    form.setFieldValue("model", undefined);
                    form.setFieldValue("apiKey", "");
                    form.setFieldValue("baseURL", "");
                    setAuthMethod("api_key");
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="model"
                label="Model"
                rules={[{ required: !isAnthropicOAuth, message: "Model is required" }]}
              >
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

          {providerDef?.supportsOAuth && (
            <Form.Item label="Authentication Method" style={{ marginBottom: 12 }}>
              <Radio.Group
                value={authMethod}
                onChange={(e) => setAuthMethod(e.target.value)}
                size="small"
                style={{ display: "flex", gap: 12 }}
              >
                <Radio.Button value="api_key" style={{ fontSize: "0.72rem", height: 30, lineHeight: "28px" }}>
                  API Key
                </Radio.Button>
                <Radio.Button value="oauth" style={{ fontSize: "0.72rem", height: 30, lineHeight: "28px" }}>
                  <LinkOutlined /> Connect Claude Account
                </Radio.Button>
              </Radio.Group>
            </Form.Item>
          )}

          {isAnthropicOAuth ? (
            <>
              <div className={styles.infoBox}>
                <InfoCircleOutlined />
                <span>
                  Connect your Claude account (Pro/Max) to use your subscription quota.
                  A browser window will open for authorization.
                </span>
              </div>
              <Row justify="end">
                <Col>
                  <PrimaryButton
                    purple
                    loading={initOAuthMutation.isLoading}
                    onClick={() => initOAuthMutation.mutate({})}
                    style={{ height: 34, fontSize: "0.78rem" }}
                  >
                    <LinkOutlined /> Connect Claude Account
                  </PrimaryButton>
                </Col>
              </Row>
            </>
          ) : (
            <>
              <Row gutter={16}>
                <Col span={provider === "openai-compatible" ? 12 : 24}>
                  <Form.Item name="apiKey" label="API Key" rules={[{ required: true, message: "API key is required" }]}>
                    <Input type="password" autoComplete="off" placeholder={providerDef?.placeholder || "API key"} />
                  </Form.Item>
                </Col>
                {provider === "openai-compatible" && (
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

              {providerDef?.hint && (
                <div className={styles.infoBox}>
                  <InfoCircleOutlined />
                  <span>{providerDef.hint}</span>
                </div>
              )}

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
                    loading={updateMutation.isLoading}
                    style={{ height: 34, fontSize: "0.78rem" }}
                  >
                    Save Configuration
                  </PrimaryButton>
                </Col>
              </Row>
            </>
          )}
        </Form>
      )}

      <Divider style={{ borderColor: "var(--border-color-100)", margin: "1.25rem 0 0.75rem" }} />

      <div className={styles.notesSection}>
        <strong>Supported Providers</strong>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          {["OpenAI", "Anthropic", "Groq", "Together AI", "OpenRouter", "Ollama", "vLLM", "LiteLLM"].map((p) => (
            <Tag
              key={p}
              style={{
                background: "var(--surface-hover)",
                border: "1px solid var(--border-color-100)",
                color: "var(--secondary-text)",
                fontSize: "0.65rem",
              }}
            >
              {p}
            </Tag>
          ))}
        </div>
      </div>

      <OAuthCodeModal
        open={showCodeModal}
        onCancel={() => { setShowCodeModal(false); setOauthState(null); }}
        onSubmit={(code) => exchangeOAuthMutation.mutate({ code, state: oauthState })}
        loading={exchangeOAuthMutation.isLoading}
      />
    </div>
  );
};

export default ModelsPage;
