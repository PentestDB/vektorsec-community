"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  App,
  AutoComplete,
  Button,
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
import RichText from "@/components/common/RichText";
import { useTranslation } from "@/i18n/I18nProvider";
import styles from "@/styles/pages/Settings.module.scss";
import { useMutation, useQuery, useQueryClient } from "react-query";
import {
  connectSubscriptionProvider,
  getAvailableModels,
  getModels,
  getSubscriptionProviders,
  testSubscriptionProvider,
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
  { value: "kimi", label: "Kimi (Moonshot AI)" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "bedrock", label: "AWS Bedrock" },
  { value: "codex-subscription", label: "Codex Subscription (Local CLI)" },
  { value: "claude-subscription", label: "Claude Subscription (Local CLI)" },
];

const REASONING_OPTIONS = ["off", "low", "medium", "high", "xhigh", "max"].map(
  (value) => ({ value, label: value.toUpperCase() }),
);

const PROVIDER_META = {
  openai: {
    keyURL: "https://platform.openai.com/api-keys",
    keyName: "OpenAI",
  },
  anthropic: {
    keyURL: "https://console.anthropic.com/settings/keys",
    keyName: "Claude",
  },
  "anthropic-compatible": {
    keyURL:
      "https://platform.minimax.io/user-center/basic-information/interface-key",
    keyName: "MiniMax",
  },
  openrouter: {
    keyURL: "https://openrouter.ai/settings/keys",
    keyName: "OpenRouter",
  },
  google: {
    keyURL: "https://aistudio.google.com/apikey",
    keyName: "Google AI",
  },
  mistralai: {
    keyURL: "https://console.mistral.ai/api-keys",
    keyName: "Mistral",
  },
  ollama: {
    keyURL: "https://ollama.com/library",
    keyName: "Ollama",
    browseModels: true,
  },
  kimi: {
    keyURL: "https://platform.kimi.ai/",
    keyName: "Kimi",
  },
  deepseek: {
    keyURL: "https://platform.deepseek.com/api_keys",
    keyName: "DeepSeek",
  },
  bedrock: {
    keyURL:
      "https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html",
    keyName: "Bedrock",
  },
};

const FALLBACK_MODELS = {
  openai: [
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-4.1",
  ],
  anthropic: [
    "claude-fable-5",
    "claude-opus-5",
    "claude-sonnet-5",
    "claude-opus-4-8",
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
    "moonshotai/kimi-k3",
    "anthropic/claude-opus-5",
    "openai/gpt-5.6-sol",
    "minimax/minimax-m2.7",
    "anthropic/claude-sonnet-4.6",
    "openai/gpt-5.5",
  ],
  google: [
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
  ],
  mistralai: ["mistral-large-latest", "mistral-medium-latest"],
  ollama: ["llama3.3", "llama3.2", "qwen2.5-coder", "mistral"],
  kimi: ["kimi-k3", "kimi-k2.7-code-highspeed", "kimi-k2.7-code", "kimi-k2.6"],
  deepseek: [
    "deepseek-chat",
    "deepseek-reasoner",
    "deepseek-v3",
    "deepseek-r1",
  ],
  bedrock: [
    "openai.gpt-oss-120b-1:0",
    "qwen.qwen3-coder-next",
    "moonshotai.kimi-k2.5",
    "mistral.mistral-large-3-675b-instruct",
  ],
  "codex-subscription": ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"],
  "claude-subscription": ["claude-fable-5", "claude-opus-5", "claude-sonnet-5"],
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
  // Bedrock's endpoint is region-specific, so allow overriding the default
  // us-east-1 host. Optional — blank falls back to the configured region.
  return [
    "anthropic-compatible",
    "openai-compatible",
    "ollama",
    "bedrock",
  ].includes(provider);
}

function isSubscriptionProvider(provider) {
  return ["codex-subscription", "claude-subscription"].includes(provider);
}

function baseURLPlaceholder(provider) {
  if (provider === "ollama") return "http://localhost:11434/v1";
  if (provider === "anthropic-compatible") {
    return "https://api.minimax.io/anthropic";
  }
  if (provider === "bedrock") {
    return "https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1";
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
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const provider = Form.useWatch("provider", form) || initialValues.provider;
  const providerMeta = PROVIDER_META[provider] || {};
  const browserModelIssue = getMagnitudeModelIssue({
    provider,
    baseURL: Form.useWatch("baseURL", form) || initialValues.baseURL,
  });

  return (
    <Modal
      title={
        initialValues.id ? t("modelsSettings.modalTitleEdit") : t("modelsSettings.modalTitleAdd")
      }
      open={open}
      onCancel={onCancel}
      footer={null}
      width={720}
      centered
      className={styles.modelModal}
      destroyOnHidden
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
              label={t("modelsSettings.labelLabel")}
              name="label"
              rules={[
                { required: true, message: t("modelsSettings.labelRequired") },
              ]}
            >
              <Input placeholder={t("modelsSettings.labelPlaceholder")} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label={t("modelsSettings.providerLabel")}
              name="provider"
              rules={[{ required: true }]}
            >
              <Select
                options={PROVIDER_OPTIONS}
                popupMatchSelectWidth={false}
                classNames={{ popup: styles.modelSelectDropdown }}
                onChange={() => {
                  form.setFieldValue("model", "");
                  form.setFieldValue("baseURL", "");
                }}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label={t("modelsSettings.modelLabel")}
              name="model"
              rules={[
                { required: true, message: t("modelsSettings.modelRequired") },
              ]}
            >
              <AutoComplete
                allowClear
                placeholder={t("modelsSettings.modelPlaceholder")}
                classNames={{ popup: styles.modelSelectDropdown }}
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
          <Col
            span={
              needsBaseURL(provider) ? 8 : isSubscriptionProvider(provider) ? 16 : 12
            }
          >
            <Form.Item label={t("modelsSettings.reasoningLabel")} name="reasoningMode">
              <Select
                options={REASONING_OPTIONS}
                classNames={{ popup: styles.modelSelectDropdown }}
              />
            </Form.Item>
          </Col>
          {!isSubscriptionProvider(provider) && (
            <Col span={needsBaseURL(provider) ? 8 : 12}>
              <Form.Item label={t("modelsSettings.apiKeyLabel")} name="apiKey">
                <Input.Password
                  autoComplete="off"
                  placeholder={
                    provider === "ollama"
                      ? t("modelsSettings.apiKeyPlaceholderOllama")
                      : t("modelsSettings.apiKeyPlaceholder")
                  }
                />
              </Form.Item>
            </Col>
          )}
          {needsBaseURL(provider) && (
            <Col span={8}>
              <Form.Item
                label={t("modelsSettings.baseUrlLabel")}
                name="baseURL"
                rules={[
                  {
                    // Optional for Ollama (local default) and Bedrock (falls
                    // back to the configured AWS region's endpoint).
                    required: !["ollama", "bedrock"].includes(provider),
                    message: t("modelsSettings.baseUrlRequired"),
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
              {t("modelsSettings.presetUnusableForBrowser", {
                issue: t(browserModelIssue),
              })}
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
                {providerMeta.browseModels
                  ? t("modelsSettings.browseProviderModels", {
                      provider: providerMeta.keyName,
                    })
                  : t("modelsSettings.getApiKey", {
                      provider: providerMeta.keyName,
                    })}
              </a>
            )}
          </Col>
          <Col>
            <div style={{ display: "flex", gap: 8 }}>
              <PrimaryButton
                onClick={onCancel}
                style={{ height: 32, fontSize: "0.75rem" }}
              >
                <CloseOutlined /> {t("common.cancel")}
              </PrimaryButton>
              <PrimaryButton
                purpleFilled
                htmlType="submit"
                style={{ height: 32, fontSize: "0.75rem" }}
              >
                <CheckOutlined /> {t("common.save")}
              </PrimaryButton>
            </div>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
};

const ModelsPage = () => {
  const { t } = useTranslation();
  const { message, notification } = App.useApp();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery(
    "unified-models",
    getModels,
    { retryOnMount: false },
  );
  const { data: catalog } = useQuery("available-models", getAvailableModels, {
    staleTime: 6 * 60 * 60 * 1000,
    cacheTime: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const { data: subscriptionData, isLoading: subscriptionLoading } = useQuery(
    "subscription-providers",
    getSubscriptionProviders,
    { refetchOnWindowFocus: false, retry: false },
  );

  const [editingModel, setEditingModel] = useState(null);

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
      message.success(t("modelsSettings.updated"));
      queryClient.invalidateQueries("unified-models");
      queryClient.invalidateQueries("magnitude-config");
    },
    onError: (err) => {
      notification.error({
        message: t("common.error"),
        description:
          err?.response?.data?.message ?? t("modelsSettings.updateFailed"),
      });
    },
  });

  const connectSubscriptionMutation = useMutation(connectSubscriptionProvider, {
    onSuccess: (res) => {
      message.success(res.message || t("modelsSettings.subscriptionConnected"));
      queryClient.invalidateQueries("unified-models");
      queryClient.invalidateQueries("subscription-providers");
    },
    onError: (err) => {
      notification.error({
        message: t("common.connectionFailed"),
        description:
          err?.response?.data?.message ??
          t("modelsSettings.subscriptionConnectFailed"),
      });
    },
  });

  const testSubscriptionMutation = useMutation(testSubscriptionProvider, {
    onSuccess: (res) => {
      if (res.ok) {
        message.success(t("modelsSettings.inferenceWorking", { model: res.model }));
      } else {
        message.warning(
          t("modelsSettings.inferenceUnexpected", { model: res.model }),
        );
      }
    },
    onError: (err) => {
      notification.error({
        message: t("modelsSettings.inferenceTestFailed"),
        description:
          err?.response?.data?.message ??
          t("modelsSettings.inferenceTestFailedBody"),
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

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message={t("modelsSettings.loadErrorTitle")}
        description={t("modelsSettings.loadErrorBody")}
        action={<Button onClick={() => refetch()}>{t("common.retry")}</Button>}
      />
    );
  }

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
    { value: NONE_MODEL_VALUE, label: t("common.none") },
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
        <span>{t("modelsSettings.info")}</span>
      </div>

      <div className={styles.warningBox}>
        <WarningOutlined />
        <span>
          <RichText text={t("modelsSettings.browserAgentWarning")} />
        </span>
      </div>

      <div className={styles.settingSectionHeader}>
        <div className={styles.heading}>
          {t("modelsSettings.subscriptionSection")}
        </div>
        <div className={styles.divider} />
      </div>
      <div className={styles.mcpTokenList}>
        {subscriptionLoading && <Loader />}
        {(subscriptionData?.providers || []).map((provider) => {
          const connected = models.some(
            (model) => model.provider === provider.provider,
          );
          const displayName =
            provider.provider === "codex-subscription"
              ? "Codex"
              : "Claude Code";
          return (
            <div key={provider.provider} className={styles.mcpTokenItem}>
              <div className={styles.mcpTokenHeader}>
                <div className={styles.mcpTokenTitle}>
                  <ApiOutlined /> {displayName}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Tag color={provider.installed ? "green" : "default"}>
                    {provider.installed
                      ? provider.version
                      : t("modelsSettings.notInstalled")}
                  </Tag>
                  <Tag color={provider.authenticated ? "green" : "warning"}>
                    {provider.authenticated
                      ? t("modelsSettings.signedIn")
                      : t("modelsSettings.signInNeeded")}
                  </Tag>
                  {connected && (
                    <Tag color="#00f2fe">
                      {t("modelsSettings.configuredTag")}
                    </Tag>
                  )}
                </div>
              </div>
              <div className={styles.mcpTokenMeta}>
                {provider.authenticated
                  ? t("modelsSettings.usesExistingLogin", {
                      name: displayName,
                      model: provider.defaultModel,
                    })
                  : provider.detail ||
                    t("modelsSettings.runLoginCommand", {
                      command: provider.loginCommand,
                    })}
              </div>
              {provider.provider === "claude-subscription" && (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: "0.68rem",
                    color: "var(--secondary-text)",
                  }}
                >
                  {t("modelsSettings.claudeTermsNote")}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <PrimaryButton
                  purpleFilled
                  disabled={!provider.installed || !provider.authenticated}
                  loading={
                    connectSubscriptionMutation.isLoading &&
                    connectSubscriptionMutation.variables?.provider ===
                      provider.provider
                  }
                  onClick={() =>
                    connectSubscriptionMutation.mutate({
                      provider: provider.provider,
                      model: provider.defaultModel,
                    })
                  }
                  style={{ height: 30, fontSize: "0.72rem" }}
                >
                  {connected
                    ? t("modelsSettings.refreshConfiguration")
                    : t("modelsSettings.useProvider", { name: displayName })}
                </PrimaryButton>
                {connected && provider.authenticated && (
                  <PrimaryButton
                    loading={
                      testSubscriptionMutation.isLoading &&
                      testSubscriptionMutation.variables?.provider ===
                        provider.provider
                    }
                    onClick={() =>
                      testSubscriptionMutation.mutate({
                        provider: provider.provider,
                        model: provider.defaultModel,
                      })
                    }
                    style={{ height: 30, fontSize: "0.72rem" }}
                  >
                    {t("modelsSettings.testInference")}
                  </PrimaryButton>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.settingSectionHeader}>
        <div className={styles.settingSectionHeaderRow}>
          <div className={styles.heading}>
            {t("modelsSettings.assignmentsSection")}
          </div>
          <PrimaryButton
            purple
            onClick={() => setEditingModel({ ...EMPTY_MODEL })}
            style={{ height: 30, fontSize: "0.72rem" }}
          >
            <PlusOutlined /> {t("modelsSettings.addModel")}
          </PrimaryButton>
        </div>
        <div className={styles.divider} />
      </div>

      <Form layout="vertical" requiredMark={false}>
        <Form.Item label={t("modelsSettings.orchestratorLabel")}>
          <Select
            allowClear
            placeholder={t("modelsSettings.orchestratorPlaceholder")}
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

        <Form.Item label={t("modelsSettings.browserAgentLabel")}>
          <Select
            placeholder={t("modelsSettings.browserAgentPlaceholder")}
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
              {t("modelsSettings.browserIncompatible", {
                issue: t(browserModelIssue),
              })}
            </span>
          </div>
        )}

        <Form.Item
          label={
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {t("modelsSettings.racersLabel")}
              <Tooltip title={t("modelsSettings.racersTooltip")}>
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
            placeholder={t("modelsSettings.racersPlaceholder")}
            value={assignments.racerModelIds || []}
            options={options}
            onChange={(value) =>
              persist(models, { ...assignments, racerModelIds: value })
            }
          />
        </Form.Item>
      </Form>

      <div className={styles.settingSectionHeader}>
        <div className={styles.heading}>{t("modelsSettings.configuredModels")}</div>
        <div className={styles.divider} />
      </div>

      {models.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t("modelsSettings.noModels")}
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
                      <Tag color="#00f2fe">
                        <CrownFilled /> {t("modelsSettings.roleOrchestrator")}
                      </Tag>
                    )}
                    {assignments.browserModelId === model.id && (
                      <Tag color="blue">{t("modelsSettings.roleBrowser")}</Tag>
                    )}
                    {(assignments.racerModelIds || []).includes(model.id) && (
                      <Tag color="gold">
                        <ThunderboltFilled /> {t("modelsSettings.roleRacer")}
                      </Tag>
                    )}
                  </div>
                </div>
                <div className={styles.mcpTokenMeta}>
                  {providerLabel(model.provider)} · {model.model} ·{" "}
                  {t("modelsSettings.reasoningTag", {
                    mode: (model.reasoningMode || "off").toUpperCase(),
                  })}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {model.apiKey && <Tag>KEY</Tag>}
                  {model.baseURL && <Tag>URL</Tag>}
                  {isMagnitudeModelCompatible(model) ? (
                    <Tag color="green">{t("modelsSettings.browserOk")}</Tag>
                  ) : (
                    <Tooltip title={t(getMagnitudeModelIssue(model))}>
                      <Tag color="warning">{t("modelsSettings.noBrowser")}</Tag>
                    </Tooltip>
                  )}
                  <Tag>
                    <BulbOutlined />{" "}
                    {(model.reasoningMode || "off").toUpperCase()}
                  </Tag>
                  <span style={{ flex: 1 }} />
                  <Tooltip title={t("modelsSettings.editModel")}>
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
                        ? t("modelsSettings.clearAssignmentsFirst")
                        : t("modelsSettings.deleteModel")
                    }
                    onConfirm={() =>
                      !isAssigned &&
                      persist(models.filter((entry) => entry.id !== model.id))
                    }
                    okText={t("common.delete")}
                    cancelText={t("common.cancel")}
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

    </div>
  );
};

export default ModelsPage;
