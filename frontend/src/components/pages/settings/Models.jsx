"use client";

import { useMemo, useState } from "react";
import {
  App,
  AutoComplete,
  Col,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Tag,
  Tooltip,
} from "antd";
import {
  ApiOutlined,
  BulbOutlined,
  CheckOutlined,
  CloseOutlined,
  CrownFilled,
  DeleteOutlined,
  EditOutlined,
  ExportOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  ThunderboltFilled,
  WarningOutlined,
} from "@ant-design/icons";
import PrimaryButton from "@/components/common/PrimaryButton";
import Loader from "@/components/common/loader/Loader";
import styles from "@/styles/pages/Settings.module.scss";
import { useMutation, useQuery, useQueryClient } from "react-query";
import {
  exchangeAnthropicOAuth,
  getAvailableModels,
  getModels,
  initiateAnthropicOAuth,
  updateModels,
} from "@/services/user.service";
import {
  getMagnitudeModelIssue,
  isMagnitudeModelCompatible,
} from "@/utils/magnitudeModels";

const PROVIDER_OPTIONS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "anthropic-compatible", label: "Anthropic-Compatible" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "google", label: "Google" },
  { value: "mistralai", label: "Mistral AI" },
  { value: "ollama", label: "Ollama (Local)" },
  { value: "openai-compatible", label: "OpenAI-Compatible" },
];

const REASONING_OPTIONS = ["off", "low", "medium", "high", "xhigh"].map(
  (value) => ({ value, label: value.toUpperCase() }),
);

const PROVIDER_META = {
  openai: {
    keyURL: "https://platform.openai.com/api-keys",
    keyLabel: "Get OpenAI API Key",
  },
  anthropic: {
    keyURL: "https://console.anthropic.com/settings/keys",
    keyLabel: "Get Claude API Key",
  },
  "anthropic-compatible": {
    keyURL:
      "https://platform.minimax.io/user-center/basic-information/interface-key",
    keyLabel: "Get MiniMax API Key",
  },
  openrouter: {
    keyURL: "https://openrouter.ai/settings/keys",
    keyLabel: "Get OpenRouter API Key",
  },
  google: {
    keyURL: "https://aistudio.google.com/apikey",
    keyLabel: "Get Google AI API Key",
  },
  mistralai: {
    keyURL: "https://console.mistral.ai/api-keys",
    keyLabel: "Get Mistral API Key",
  },
  ollama: {
    keyURL: "https://ollama.com/library",
    keyLabel: "Browse Ollama models",
  },
};

const FALLBACK_MODELS = {
  openai: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-4.1"],
  anthropic: [
    "claude-opus-4-7",
    "claude-mythos-preview",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
  ],
  "anthropic-compatible": [
    "MiniMax-M2.7",
    "MiniMax-M2.7-highspeed",
    "MiniMax-M2.5",
    "MiniMax-M2",
  ],
  openrouter: [
    "minimax/minimax-m2.7",
    "anthropic/claude-sonnet-4.6",
    "openai/gpt-5.5",
  ],
  google: ["gemini-2.0-flash", "gemini-2.0-pro"],
  mistralai: ["mistral-large-latest", "mistral-medium-latest"],
  ollama: ["llama3.3", "llama3.2", "qwen2.5-coder", "mistral"],
};

const EMPTY_MODEL = {
  label: "",
  provider: "openai",
  model: "",
  apiKey: "",
  baseURL: "",
  reasoningMode: "off",
};

const NONE_MODEL_VALUE = "__none__";

function createModelId(label) {
  const suffix =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : String(Date.now()).slice(-8);
  const slug =
    label
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "model";
  return `${slug}-${suffix}`;
}

function needsBaseURL(provider) {
  return ["anthropic-compatible", "openai-compatible", "ollama"].includes(
    provider,
  );
}

function baseURLPlaceholder(provider) {
  if (provider === "ollama") return "http://localhost:11434/v1";
  if (provider === "anthropic-compatible") {
    return "https://api.minimax.io/anthropic";
  }
  return "https://api.groq.com/openai/v1";
}

function providerLabel(provider) {
  return (
    PROVIDER_OPTIONS.find((option) => option.value === provider)?.label ||
    provider
  );
}

function assignedIds(assignments) {
  return new Set(
    [
      assignments?.orchestratorModelId,
      assignments?.browserModelId,
      ...(assignments?.racerModelIds || []),
    ].filter(Boolean),
  );
}

const ModelModal = ({
  open,
  initialValues,
  modelSuggestions,
  onCancel,
  onSubmit,
}) => {
  const [form] = Form.useForm();
  const provider = Form.useWatch("provider", form) || initialValues.provider;
  const providerMeta = PROVIDER_META[provider] || {};
  const browserModelIssue = getMagnitudeModelIssue({
    provider,
    baseURL: Form.useWatch("baseURL", form) || initialValues.baseURL,
  });

  return (
    <Modal
      title={initialValues.id ? "Edit Model" : "Add Model"}
      open={open}
      onCancel={onCancel}
      footer={null}
      width={720}
      centered
      className={styles.modelModal}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={initialValues}
        onFinish={(values) => {
          const entry = {
            ...initialValues,
            ...values,
            id: initialValues.id || createModelId(values.label),
          };
          if (!entry.apiKey) delete entry.apiKey;
          if (!entry.baseURL) delete entry.baseURL;
          onSubmit(entry);
        }}
      >
        <Row gutter={14}>
          <Col span={8}>
            <Form.Item
              label="Label"
              name="label"
              rules={[{ required: true, message: "Label is required" }]}
            >
              <Input placeholder="e.g. Claude Sonnet" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label="Provider"
              name="provider"
              rules={[{ required: true }]}
            >
              <Select
                options={PROVIDER_OPTIONS}
                popupMatchSelectWidth={false}
                popupClassName={styles.modelSelectDropdown}
                onChange={() => {
                  form.setFieldValue("model", "");
                  form.setFieldValue("baseURL", "");
                }}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label="Model"
              name="model"
              rules={[{ required: true, message: "Model is required" }]}
            >
              <AutoComplete
                allowClear
                placeholder="Select or type a model"
                popupClassName={styles.modelSelectDropdown}
                options={(modelSuggestions[provider] || []).map((model) => ({
                  value: model,
                  label: model,
                }))}
                filterOption={(input, option) =>
                  option.value.toLowerCase().includes(input.toLowerCase())
                }
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={14}>
          <Col span={needsBaseURL(provider) ? 8 : 12}>
            <Form.Item label="Reasoning" name="reasoningMode">
              <Select
                options={REASONING_OPTIONS}
                popupClassName={styles.modelSelectDropdown}
              />
            </Form.Item>
          </Col>
          <Col span={needsBaseURL(provider) ? 8 : 12}>
            <Form.Item label="API Key" name="apiKey">
              <Input.Password
                autoComplete="off"
                placeholder={
                  provider === "ollama"
                    ? "Optional for local Ollama"
                    : "Optional if using OAuth"
                }
              />
            </Form.Item>
          </Col>
          {needsBaseURL(provider) && (
            <Col span={8}>
              <Form.Item
                label="Base URL"
                name="baseURL"
                rules={[
                  {
                    required: provider !== "ollama",
                    message: "Base URL is required",
                  },
                ]}
              >
                <Input placeholder={baseURLPlaceholder(provider)} />
              </Form.Item>
            </Col>
          )}
        </Row>

        {browserModelIssue && (
          <div className={styles.warningBox} style={{ marginBottom: "1rem" }}>
            <WarningOutlined />
            <span>
              This preset can still be used for orchestrator or racers, but it
              will not appear in the Browser Agent selector.{" "}
              {browserModelIssue}
            </span>
          </div>
        )}

        <Row justify="space-between" align="middle">
          <Col>
            {providerMeta.keyURL && (
              <a
                href={providerMeta.keyURL}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.externalLink}
              >
                <ExportOutlined style={{ fontSize: 11 }} />
                {providerMeta.keyLabel}
              </a>
            )}
          </Col>
          <Col>
            <div style={{ display: "flex", gap: 8 }}>
              <PrimaryButton
                onClick={onCancel}
                style={{ height: 32, fontSize: "0.75rem" }}
              >
                <CloseOutlined /> Cancel
              </PrimaryButton>
              <PrimaryButton
                purpleFilled
                htmlType="submit"
                style={{ height: 32, fontSize: "0.75rem" }}
              >
                <CheckOutlined /> Save
              </PrimaryButton>
            </div>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
};

const ModelsPage = () => {
  const { message, notification } = App.useApp();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery("unified-models", getModels);
  const { data: catalog } = useQuery("available-models", getAvailableModels, {
    staleTime: 6 * 60 * 60 * 1000,
    cacheTime: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const [editingModel, setEditingModel] = useState(null);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [oauthState, setOauthState] = useState(null);

  const models = data?.models || [];
  const assignments = data?.assignments || { racerModelIds: [] };
  const protectedIds = assignedIds(assignments);

  const modelSuggestions = useMemo(() => {
    const suggestions = { ...FALLBACK_MODELS };
    if (catalog?.providers) {
      for (const provider of catalog.providers) {
        const existing = new Set(suggestions[provider.id] || []);
        suggestions[provider.id] = [...existing];
        for (const catalogModel of provider.models) {
          const modelId =
            provider.id === "anthropic"
              ? catalogModel.modelId.replace(/(\d+)\.(\d+)/g, "$1-$2")
              : catalogModel.modelId;
          if (!existing.has(modelId)) {
            existing.add(modelId);
            suggestions[provider.id].push(modelId);
          }
        }
      }
    }
    return suggestions;
  }, [catalog]);

  const persistMutation = useMutation(updateModels, {
    onSuccess: () => {
      message.success("Models updated");
      queryClient.invalidateQueries("unified-models");
      queryClient.invalidateQueries("magnitude-config");
    },
    onError: (err) => {
      notification.error({
        message: "Error",
        description: err?.response?.data?.message ?? "Failed to update models",
      });
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
        description: err?.response?.data?.message ?? "Failed to initiate OAuth",
      });
    },
  });

  const exchangeOAuthMutation = useMutation(exchangeAnthropicOAuth, {
    onSuccess: () => {
      message.success("Claude account connected");
      setShowCodeModal(false);
      setOauthState(null);
    },
    onError: (err) => {
      notification.error({
        message: "OAuth Error",
        description: err?.response?.data?.message ?? "Failed to exchange code",
      });
    },
  });

  const persist = (nextModels, nextAssignments = assignments) => {
    persistMutation.mutate({
      models: nextModels,
      assignments: nextAssignments,
    });
  };

  if (isLoading) return <Loader />;

  const options = models.map((model) => ({
    value: model.id,
    label: `${model.label} · ${model.model}`,
  }));
  const browserModelOptions = models
    .filter(isMagnitudeModelCompatible)
    .map((model) => ({
      value: model.id,
      label: `${model.label} · ${model.model}`,
    }));
  const optionalModelOptions = [
    { value: NONE_MODEL_VALUE, label: "None" },
    ...browserModelOptions,
  ];
  const selectedBrowserModel = models.find(
    (model) => model.id === assignments.browserModelId,
  );
  const browserModelIssue =
    selectedBrowserModel && getMagnitudeModelIssue(selectedBrowserModel);

  return (
    <div className={styles.settingsContainer}>
      <div className={styles.infoBox}>
        <InfoCircleOutlined />
        <span>
          Configure model credentials once, then choose which model runs the
          orchestrator, Browser Agent, and optional racers.
        </span>
      </div>

      <div className={styles.warningBox}>
        <WarningOutlined />
        <span>
          Browser Agent only shows Magnitude-compatible presets. For MiniMax,
          use provider <strong>OpenAI-Compatible</strong> with base URL{" "}
          <code>https://api.minimax.io/v1</code>. Anthropic-Compatible MiniMax
          presets can still be used by orchestrator/racers, but not by Browser
          Agent.
        </span>
      </div>

      <div className={styles.settingSectionHeader}>
        <div className={styles.settingSectionHeaderRow}>
          <div className={styles.heading}>Assignments</div>
          <PrimaryButton
            purple
            onClick={() => setEditingModel({ ...EMPTY_MODEL })}
            style={{ height: 30, fontSize: "0.72rem" }}
          >
            <PlusOutlined /> Add Model
          </PrimaryButton>
        </div>
        <div className={styles.divider} />
      </div>

      <Form layout="vertical" requiredMark={false}>
        <Form.Item label="Orchestrator">
          <Select
            allowClear
            placeholder="Select orchestrator model"
            value={assignments.orchestratorModelId}
            options={options}
            onChange={(value) =>
              persist(models, {
                ...assignments,
                orchestratorModelId: value,
                racerModelIds: (assignments.racerModelIds || []).filter(
                  (id) => id !== value,
                ),
              })
            }
          />
        </Form.Item>

        <Form.Item label="Browser Agent">
          <Select
            placeholder="Select browser model"
            value={browserModelIssue ? NONE_MODEL_VALUE : assignments.browserModelId}
            options={optionalModelOptions}
            onChange={(value) =>
              persist(models, {
                ...assignments,
                browserModelId:
                  value === NONE_MODEL_VALUE ? undefined : value,
              })
            }
          />
        </Form.Item>

        {browserModelIssue && (
          <div className={styles.errorBox} style={{ marginTop: "-0.5rem" }}>
            <WarningOutlined />
            <span>
              The currently assigned Browser Agent model is incompatible and is
              hidden from the selector. Choose a compatible preset or set
              Browser Agent to None. {browserModelIssue}
            </span>
          </div>
        )}

        <Form.Item
          label={
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              Racers
              <Tooltip title="Racers are optional parallel agents. Only selected models run as racers.">
                <InfoCircleOutlined
                  style={{ color: "var(--secondary-text)", fontSize: 11 }}
                />
              </Tooltip>
            </span>
          }
        >
          <Select
            mode="multiple"
            allowClear
            placeholder="Select optional racer models"
            value={assignments.racerModelIds || []}
            options={options}
            onChange={(value) =>
              persist(models, { ...assignments, racerModelIds: value })
            }
          />
        </Form.Item>
      </Form>

      <div className={styles.settingSectionHeader}>
        <div className={styles.heading}>Configured Models</div>
        <div className={styles.divider} />
      </div>

      {models.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No models configured"
          style={{ margin: "24px 0" }}
        />
      ) : (
        <div className={styles.mcpTokenList}>
          {models.map((model) => {
            const isAssigned = protectedIds.has(model.id);
            return (
              <div key={model.id} className={styles.mcpTokenItem}>
                <div className={styles.mcpTokenHeader}>
                  <div className={styles.mcpTokenTitle}>
                    <ApiOutlined />
                    {model.label}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {assignments.orchestratorModelId === model.id && (
                      <Tag color="purple">
                        <CrownFilled /> Orchestrator
                      </Tag>
                    )}
                    {assignments.browserModelId === model.id && (
                      <Tag color="blue">Browser</Tag>
                    )}
                    {(assignments.racerModelIds || []).includes(model.id) && (
                      <Tag color="gold">
                        <ThunderboltFilled /> Racer
                      </Tag>
                    )}
                  </div>
                </div>
                <div className={styles.mcpTokenMeta}>
                  {providerLabel(model.provider)} · {model.model} · Reasoning{" "}
                  {(model.reasoningMode || "off").toUpperCase()}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {model.apiKey && <Tag>KEY</Tag>}
                  {model.baseURL && <Tag>URL</Tag>}
                  {isMagnitudeModelCompatible(model) ? (
                    <Tag color="green">BROWSER OK</Tag>
                  ) : (
                    <Tooltip title={getMagnitudeModelIssue(model)}>
                      <Tag color="warning">NO BROWSER</Tag>
                    </Tooltip>
                  )}
                  <Tag>
                    <BulbOutlined />{" "}
                    {(model.reasoningMode || "off").toUpperCase()}
                  </Tag>
                  <span style={{ flex: 1 }} />
                  <Tooltip title="Edit model">
                    <EditOutlined
                      onClick={() => setEditingModel(model)}
                      style={{
                        color: "var(--secondary-text)",
                        cursor: "pointer",
                      }}
                    />
                  </Tooltip>
                  <Popconfirm
                    title={
                      isAssigned
                        ? "Clear assignments before deleting this model."
                        : "Delete this model?"
                    }
                    onConfirm={() =>
                      !isAssigned &&
                      persist(models.filter((entry) => entry.id !== model.id))
                    }
                    okText="Delete"
                    cancelText="Cancel"
                  >
                    <DeleteOutlined
                      style={{
                        color: isAssigned
                          ? "var(--secondary-text-500)"
                          : "var(--secondary-text)",
                        cursor: isAssigned ? "not-allowed" : "pointer",
                      }}
                    />
                  </Popconfirm>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <PrimaryButton
          onClick={() => initOAuthMutation.mutate({})}
          loading={initOAuthMutation.isLoading}
          style={{ height: 30, fontSize: "0.72rem" }}
        >
          Connect Claude OAuth
        </PrimaryButton>
      </div>

      <ModelModal
        open={!!editingModel}
        initialValues={editingModel || EMPTY_MODEL}
        modelSuggestions={modelSuggestions}
        onCancel={() => setEditingModel(null)}
        onSubmit={(entry) => {
          const exists = models.some((model) => model.id === entry.id);
          persist(
            exists
              ? models.map((model) => (model.id === entry.id ? entry : model))
              : [...models, entry],
          );
          setEditingModel(null);
        }}
      />

      <Modal
        title="Paste Authorization Code"
        open={showCodeModal}
        onCancel={() => setShowCodeModal(false)}
        footer={null}
        width={520}
        centered
        className={styles.modelModal}
      >
        <Form
          layout="vertical"
          onFinish={({ code }) =>
            exchangeOAuthMutation.mutate({
              code: code.trim(),
              state: oauthState,
            })
          }
        >
          <Form.Item
            label="Authorization Code"
            name="code"
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col>
              <PrimaryButton onClick={() => setShowCodeModal(false)}>
                Cancel
              </PrimaryButton>
            </Col>
            <Col>
              <PrimaryButton
                purple
                htmlType="submit"
                loading={exchangeOAuthMutation.isLoading}
              >
                Connect
              </PrimaryButton>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};

export default ModelsPage;
