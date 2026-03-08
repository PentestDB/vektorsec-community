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
    models: [
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-4-turbo",
      "gpt-4",
      "gpt-3.5-turbo",
      "o1",
      "o1-mini",
      "o3-mini",
    ],
    placeholder: "sk-...",
    hint: "Uses the OpenAI API directly. Best for GPT-4o and o-series models.",
    keyURL: "https://platform.openai.com/api-keys",
    keyLabel: "Get OpenAI API Key",
    supportsOAuth: false,
  },
  {
    value: "anthropic",
    label: "Anthropic (Claude)",
    models: [
      "claude-sonnet-4-20250514",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229",
    ],
    placeholder: "sk-ant-...",
    hint: "Uses Anthropic's API via their OpenAI-compatible endpoint. Works with all Claude models.",
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
      onCancel={() => {
        setCode("");
        onCancel();
      }}
      footer={null}
      width={520}
    >
      <div style={{ marginBottom: 16 }}>
        <p
          style={{
            color: "var(--secondary-text)",
            fontSize: "0.78rem",
            lineHeight: 1.6,
            margin: "0 0 12px 0",
          }}
        >
          After authorizing in your browser, you will be redirected to a page
          showing an authorization code. Copy the full code and paste it below.
        </p>
        <Input.TextArea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Paste the authorization code here..."
          rows={3}
          style={{ fontFamily: "monospace", fontSize: "0.78rem" }}
        />
      </div>
      <Row justify="end" gutter={8}>
        <Col>
          <PrimaryButton
            onClick={() => {
              setCode("");
              onCancel();
            }}
            style={{ height: 34, fontSize: "0.78rem" }}
          >
            Cancel
          </PrimaryButton>
        </Col>
        <Col>
          <PrimaryButton
            purple
            loading={loading}
            disabled={!code.trim()}
            onClick={() => {
              onSubmit(code.trim());
              setCode("");
            }}
            style={{ height: 34, fontSize: "0.78rem" }}
          >
            Connect
          </PrimaryButton>
        </Col>
      </Row>
    </Modal>
  );
};

const SlotCard = ({ title, description, data }) => {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const provider = Form.useWatch("provider", form);
  const [authMethod, setAuthMethod] = useState(
    data?.authMethod === "oauth" ? "oauth" : "api_key"
  );
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [oauthState, setOauthState] = useState(null);

  const providerDef = PROVIDERS.find((p) => p.value === provider);
  const isAnthropicOAuth = provider === "anthropic" && authMethod === "oauth";
  const isOAuthConnected =
    data?.oauthConnected && data?.authMethod === "oauth";

  const updateMutation = useMutation(updateModelConfig, {
    onSuccess: () => {
      message.success(`${title} updated`);
      queryClient.invalidateQueries("model-config");
    },
    onError: (err) => {
      notification.error({
        message: "Error",
        description: err?.response?.data?.message ?? "Failed to update",
      });
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
      notification.error({
        message: "OAuth Error",
        description:
          err?.response?.data?.message ?? "Failed to initiate OAuth",
      });
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
      notification.error({
        message: "OAuth Error",
        description:
          err?.response?.data?.message ?? "Failed to exchange OAuth code",
      });
    },
  });

  const disconnectMutation = useMutation(disconnectAnthropicOAuth, {
    onSuccess: () => {
      message.success("Claude OAuth disconnected");
      queryClient.invalidateQueries("model-config");
      setAuthMethod("api_key");
    },
    onError: (err) => {
      notification.error({
        message: "Error",
        description:
          err?.response?.data?.message ?? "Failed to disconnect OAuth",
      });
    },
  });

  const handleSubmit = (values) => {
    updateMutation.mutate({
      provider: values.provider,
      model: values.model,
      apiKey: values.apiKey,
      baseURL: values.baseURL || "",
    });
  };

  const handleOAuthConnect = () => {
    initOAuthMutation.mutate({});
  };

  const handleOAuthCodeSubmit = (code) => {
    exchangeOAuthMutation.mutate({ code, state: oauthState });
  };

  return (
    <div className={styles.settingsContainer} style={{ padding: 0 }}>
      <div
        style={{
          border: "1px solid var(--border-color-100)",
          background: "var(--secondary-bg)",
          borderRadius: 8,
          padding: "1.25rem 1.5rem",
          marginBottom: "1rem",
        }}
      >
        <Row
          justify="space-between"
          align="middle"
          style={{ marginBottom: 16 }}
        >
          <Col>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  color: "var(--primary-text)",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                }}
              >
                {title}
              </span>
              {isOAuthConnected ? (
                <Tag
                  color="blue"
                  style={{
                    margin: 0,
                    fontSize: "0.6rem",
                    lineHeight: "1.5",
                    border: "none",
                  }}
                >
                  <ApiOutlined /> CLAUDE CONNECTED
                </Tag>
              ) : data?.configured ? (
                <Tag
                  color="green"
                  style={{
                    margin: 0,
                    fontSize: "0.6rem",
                    lineHeight: "1.5",
                    border: "none",
                  }}
                >
                  <CheckCircleFilled /> CONFIGURED
                </Tag>
              ) : (
                <Tag
                  style={{
                    margin: 0,
                    fontSize: "0.6rem",
                    lineHeight: "1.5",
                    background: "var(--status-grey)",
                    border: "1px solid var(--border-color-100)",
                    color: "var(--secondary-text)",
                  }}
                >
                  USING DEFAULTS
                </Tag>
              )}
            </div>
            <span
              style={{
                color: "var(--secondary-text)",
                fontSize: "0.72rem",
                marginTop: 4,
                display: "block",
              }}
            >
              {description}
            </span>
          </Col>
          {(data?.configured || isOAuthConnected) && (
            <Col>
              {isOAuthConnected ? (
                <Popconfirm
                  title="Disconnect Claude account?"
                  description="Removes OAuth tokens. You can reconnect or switch to an API key."
                  onConfirm={() => disconnectMutation.mutate({})}
                  okText="Disconnect"
                  cancelText="Cancel"
                >
                  <Tooltip title="Disconnect Claude OAuth">
                    <DisconnectOutlined
                      style={{
                        color: "var(--secondary-text)",
                        fontSize: 14,
                        cursor: "pointer",
                      }}
                    />
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
                    <DeleteOutlined
                      style={{
                        color: "var(--secondary-text)",
                        fontSize: 14,
                        cursor: "pointer",
                      }}
                    />
                  </Tooltip>
                </Popconfirm>
              )}
            </Col>
          )}
        </Row>

        {isOAuthConnected ? (
          <div>
            <div
              style={{
                padding: "12px 14px",
                backgroundColor: "var(--input-bg)",
                borderRadius: 6,
                border: "1px solid var(--border-color-100)",
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <ApiOutlined
                  style={{ color: "var(--accent-color)", fontSize: 14 }}
                />
                <span
                  style={{
                    color: "var(--primary-text)",
                    fontSize: "0.78rem",
                    fontWeight: 500,
                  }}
                >
                  Connected via Claude Account
                </span>
              </div>
              <p
                style={{
                  color: "var(--secondary-text)",
                  fontSize: "0.7rem",
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                Inference uses your Claude subscription (Pro/Max). No API key
                needed.
              </p>
            </div>

            <Row gutter={16} style={{ marginBottom: 14 }}>
              <Col span={24}>
                <label
                  style={{
                    color: "var(--primary-text)",
                    fontSize: "0.78rem",
                    fontWeight: 500,
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Model
                </label>
                <AutoComplete
                  value={data?.model}
                  style={{ width: "100%" }}
                  allowClear
                  placeholder="Select or type a model"
                  options={PROVIDERS.find(
                    (p) => p.value === "anthropic"
                  ).models.map((m) => ({
                    value: m,
                    label: m,
                  }))}
                  popupMatchSelectWidth={false}
                  filterOption={(input, option) =>
                    option.value.toLowerCase().includes(input.toLowerCase())
                  }
                  onChange={(model) => {
                    if (model) {
                      updateMutation.mutate({
                        provider: "anthropic",
                        model,
                        apiKey: data?.apiKey || "",
                        baseURL: "",
                      });
                    }
                  }}
                />
              </Col>
            </Row>
          </div>
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
                <Form.Item
                  name="provider"
                  label="Provider"
                  rules={[{ required: true }]}
                >
                  <Select
                    options={PROVIDERS.map((p) => ({
                      value: p.value,
                      label: p.label,
                    }))}
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
                  rules={[
                    {
                      required: !isAnthropicOAuth,
                      message: "Model is required",
                    },
                  ]}
                >
                  <AutoComplete
                    allowClear
                    placeholder={
                      providerDef?.models?.length
                        ? "Select or type a custom model"
                        : "e.g. llama-3.1-70b-versatile"
                    }
                    options={(providerDef?.models || []).map((m) => ({
                      value: m,
                      label: m,
                    }))}
                    popupMatchSelectWidth={false}
                    filterOption={(input, option) =>
                      option.value.toLowerCase().includes(input.toLowerCase())
                    }
                  />
                </Form.Item>
              </Col>
            </Row>

            {providerDef?.supportsOAuth && (
              <div style={{ marginBottom: 14 }}>
                <label
                  style={{
                    color: "var(--primary-text)",
                    fontSize: "0.78rem",
                    fontWeight: 500,
                    display: "block",
                    marginBottom: 8,
                  }}
                >
                  Authentication Method
                </label>
                <Radio.Group
                  value={authMethod}
                  onChange={(e) => setAuthMethod(e.target.value)}
                  size="small"
                  style={{ display: "flex", gap: 12 }}
                >
                  <Radio.Button
                    value="api_key"
                    style={{
                      fontSize: "0.72rem",
                      height: 30,
                      lineHeight: "28px",
                    }}
                  >
                    API Key
                  </Radio.Button>
                  <Radio.Button
                    value="oauth"
                    style={{
                      fontSize: "0.72rem",
                      height: 30,
                      lineHeight: "28px",
                    }}
                  >
                    <LinkOutlined /> Connect Claude Account
                  </Radio.Button>
                </Radio.Group>
              </div>
            )}

            {isAnthropicOAuth ? (
              <div>
                <div
                  style={{
                    color: "var(--secondary-text)",
                    fontSize: "0.7rem",
                    marginBottom: 14,
                    padding: "10px 12px",
                    backgroundColor: "var(--input-bg)",
                    borderRadius: 6,
                    border: "1px solid var(--border-color-100)",
                    lineHeight: 1.6,
                  }}
                >
                  <InfoCircleOutlined style={{ marginRight: 6 }} />
                  Connect your Claude account (Pro/Max subscription) to use your
                  subscription quota directly. A browser window will open for
                  authorization. After approving, paste the code shown on the
                  redirect page.
                </div>
                <Row justify="end">
                  <Col>
                    <PrimaryButton
                      purple
                      loading={initOAuthMutation.isLoading}
                      onClick={handleOAuthConnect}
                      style={{ height: 34, fontSize: "0.78rem" }}
                    >
                      <LinkOutlined /> Connect Claude Account
                    </PrimaryButton>
                  </Col>
                </Row>
              </div>
            ) : (
              <>
                <Row gutter={16}>
                  <Col span={provider === "openai-compatible" ? 12 : 24}>
                    <Form.Item
                      name="apiKey"
                      label="API Key"
                      rules={[
                        { required: true, message: "API key is required" },
                      ]}
                    >
                      <Input
                        type="password"
                        autoComplete="off"
                        placeholder={providerDef?.placeholder || "API key"}
                      />
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
                              <InfoCircleOutlined
                                style={{
                                  color: "var(--secondary-text)",
                                  fontSize: 11,
                                }}
                              />
                            </Tooltip>
                          </span>
                        }
                        rules={[
                          {
                            required: true,
                            message: "Base URL is required",
                          },
                        ]}
                      >
                        <Input placeholder="https://api.groq.com/openai/v1" />
                      </Form.Item>
                    </Col>
                  )}
                </Row>

                {providerDef?.hint && (
                  <div
                    style={{
                      color: "var(--secondary-text)",
                      fontSize: "0.7rem",
                      marginBottom: 14,
                      padding: "8px 10px",
                      backgroundColor: "var(--input-bg)",
                      borderRadius: 6,
                      border: "1px solid var(--border-color-100)",
                      lineHeight: 1.5,
                    }}
                  >
                    <InfoCircleOutlined style={{ marginRight: 6 }} />
                    {providerDef.hint}
                  </div>
                )}

                <Row justify="space-between" align="middle">
                  <Col>
                    {providerDef?.keyURL && (
                      <a
                        href={providerDef.keyURL}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "var(--secondary-text)",
                          fontSize: "0.72rem",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          textDecoration: "none",
                          transition: "color 0.15s ease",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.color = "var(--primary-text)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.color =
                            "var(--secondary-text)")
                        }
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
      </div>

      <OAuthCodeModal
        open={showCodeModal}
        onCancel={() => {
          setShowCodeModal(false);
          setOauthState(null);
        }}
        onSubmit={handleOAuthCodeSubmit}
        loading={exchangeOAuthMutation.isLoading}
      />
    </div>
  );
};

const ModelsPage = () => {
  const { data, isLoading } = useQuery("model-config", getModelConfig);

  if (isLoading) return <Loader />;

  return (
    <div className={styles.settingsContainer}>
      <div style={{ maxWidth: 780 }}>
        <p
          style={{
            color: "var(--secondary-text)",
            fontSize: "0.78rem",
            margin: "0 0 1.5rem 0",
            lineHeight: 1.6,
          }}
        >
          Configure the LLM model used for all inference. For Anthropic, you can
          connect your Claude account directly via OAuth. Changes are saved
          server-wide and take effect immediately.
        </p>

        <SlotCard
          title="Model Configuration"
          description="Used for command generation, analysis, reasoning, summaries, and all other LLM tasks."
          data={data}
        />

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
            Supported Providers
          </strong>
          <div
            style={{
              marginTop: 8,
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            {[
              "OpenAI",
              "Anthropic",
              "Groq",
              "Together AI",
              "OpenRouter",
              "Ollama",
              "vLLM",
              "LiteLLM",
            ].map((p) => (
              <Tag
                key={p}
                style={{
                  background: "var(--input-bg)",
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
      </div>
    </div>
  );
};

export default ModelsPage;
