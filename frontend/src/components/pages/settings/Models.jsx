"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Form,
  Input,
  Select,
  AutoComplete,
  Row,
  Col,
  Tag,
  App,
  Tooltip,
  Popconfirm,
  Empty,
  Modal,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  CheckOutlined,
  CloseOutlined,
  InfoCircleOutlined,
  BulbOutlined,
  CrownFilled,
  ThunderboltFilled,
  HolderOutlined,
  ExportOutlined,
  LinkOutlined,
  ApiOutlined,
} from "@ant-design/icons";
import PrimaryButton from "@/components/common/PrimaryButton";
import Loader from "@/components/common/loader/Loader";
import styles from "@/styles/pages/Settings.module.scss";
import { useMutation, useQuery, useQueryClient } from "react-query";
import {
  getModels,
  updateModels,
  getAvailableModels,
  initiateAnthropicOAuth,
  exchangeAnthropicOAuth,
} from "@/services/user.service";

const PROVIDER_OPTIONS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "minimax", label: "MiniMax" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "google", label: "Google" },
  { value: "mistralai", label: "Mistral AI" },
  { value: "openai-compatible", label: "OpenAI-Compatible" },
];

const REASONING_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "XHigh" },
];

const REASONING_META = {
  off: { color: "var(--secondary-text)", bg: "transparent", border: "1px solid var(--border-color-100)" },
  low: { color: "#52c41a", bg: "rgba(82, 196, 26, 0.1)", border: "1px solid rgba(82, 196, 26, 0.25)" },
  medium: { color: "#faad14", bg: "rgba(250, 173, 20, 0.12)", border: "1px solid rgba(250, 173, 20, 0.3)" },
  high: { color: "#ff7875", bg: "rgba(255, 120, 117, 0.14)", border: "1px solid rgba(255, 120, 117, 0.32)" },
  xhigh: { color: "#ff4d4f", bg: "rgba(255, 77, 79, 0.16)", border: "1px solid rgba(255, 77, 79, 0.38)" },
};

const PROVIDER_META = {
  openai: { keyURL: "https://platform.openai.com/api-keys", keyLabel: "Get OpenAI API Key" },
  anthropic: { keyURL: "https://console.anthropic.com/settings/keys", keyLabel: "Get Claude API Key" },
  minimax: { keyURL: "https://platform.minimax.io/user-center/basic-information/interface-key", keyLabel: "Get MiniMax API Key" },
  openrouter: { keyURL: "https://openrouter.ai/settings/keys", keyLabel: "Get OpenRouter API Key" },
  google: { keyURL: "https://aistudio.google.com/apikey", keyLabel: "Get Google AI API Key" },
  mistralai: { keyURL: "https://console.mistral.ai/api-keys", keyLabel: "Get Mistral API Key" },
};

const FALLBACK_MODELS = {
  openai: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.3-codex", "gpt-5.3-codex-spark", "gpt-5.2", "gpt-4.1", "gpt-4.1-mini"],
  anthropic: ["claude-opus-4-7", "claude-mythos-preview", "claude-sonnet-4-6", "claude-haiku-4-5", "claude-haiku-4-5-20251001", "claude-opus-4-6", "claude-sonnet-4-5"],
  minimax: ["MiniMax-M2.7", "MiniMax-M2.7-highspeed", "MiniMax-M2.5", "MiniMax-M2.5-highspeed", "MiniMax-M2.1", "MiniMax-M2.1-highspeed", "MiniMax-M2"],
  openrouter: ["minimax/minimax-m2.7", "minimax/minimax-m2.7-highspeed", "anthropic/claude-opus-4.7", "anthropic/claude-mythos-preview", "anthropic/claude-sonnet-4.6", "openai/gpt-5.5", "openai/gpt-5.4"],
  google: ["gemini-2.0-flash", "gemini-2.0-pro"],
  mistralai: ["mistral-large-latest", "mistral-medium-latest"],
};

const EMPTY_MODEL = { label: "", provider: "openai", model: "", apiKey: "", baseURL: "", reasoningMode: "off" };

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

const ModelCard = ({ model, index, total, onRemove, onEdit, onMoveUp, onMoveDown }) => {
  const isOrchestrator = index === 0;
  const reasoningMode = model.reasoningMode || "off";
  const reasoningStyle = REASONING_META[reasoningMode] || REASONING_META.off;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 14px",
        marginBottom: 6,
        borderRadius: 8,
        border: `1px solid ${isOrchestrator ? "rgba(142, 53, 255, 0.3)" : "var(--border-color-100)"}`,
        backgroundColor: isOrchestrator ? "rgba(142, 53, 255, 0.06)" : "var(--surface-hover)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginRight: 2 }}>
        <HolderOutlined
          onClick={index > 0 ? onMoveUp : undefined}
          style={{
            fontSize: 9,
            color: index > 0 ? "var(--secondary-text)" : "transparent",
            cursor: index > 0 ? "pointer" : "default",
            transform: "rotate(90deg)",
          }}
        />
        <HolderOutlined
          onClick={index < total - 1 ? onMoveDown : undefined}
          style={{
            fontSize: 9,
            color: index < total - 1 ? "var(--secondary-text)" : "transparent",
            cursor: index < total - 1 ? "pointer" : "default",
            transform: "rotate(90deg)",
          }}
        />
      </div>

      {isOrchestrator ? (
        <Tooltip title="Orchestrator — this model runs the main session">
          <Tag color="purple" style={{ margin: 0, fontSize: "0.62rem", fontWeight: 700, lineHeight: "16px" }}>
            <CrownFilled /> ORCHESTRATOR
          </Tag>
        </Tooltip>
      ) : (
        <Tooltip title="Racer — runs in parallel on every user message">
          <Tag style={{
            margin: 0, fontSize: "0.62rem", fontWeight: 600, lineHeight: "16px",
            background: "rgba(240, 192, 0, 0.1)", border: "1px solid rgba(240, 192, 0, 0.25)", color: "#f0c000",
          }}>
            <ThunderboltFilled /> RACER
          </Tag>
        </Tooltip>
      )}

      <Tag color="blue" style={{ margin: 0, fontSize: "0.68rem", fontWeight: 600 }}>
        {model.label}
      </Tag>
      <span style={{ fontSize: "0.72rem", color: "var(--secondary-text)" }}>
        {(PROVIDER_OPTIONS.find((p) => p.value === model.provider) || {}).label || model.provider}
      </span>
      <span style={{ fontSize: "0.72rem", color: "var(--primary-text)", fontFamily: "'JetBrains Mono', monospace" }}>
        {model.model}
      </span>

      <Tooltip title={`Reasoning mode: ${reasoningMode}`}>
        <Tag style={{ margin: 0, fontSize: "0.6rem", background: reasoningStyle.bg, border: reasoningStyle.border, color: reasoningStyle.color }}>
          <BulbOutlined /> {reasoningMode.toUpperCase()}
        </Tag>
      </Tooltip>
      {model.apiKey && (
        <Tooltip title="Has custom API key">
          <Tag style={{ margin: 0, fontSize: "0.6rem", background: "transparent", border: "1px solid var(--border-color-100)", color: "var(--secondary-text)" }}>
            KEY
          </Tag>
        </Tooltip>
      )}
      {model.baseURL && (
        <Tooltip title={model.baseURL}>
          <Tag style={{ margin: 0, fontSize: "0.6rem", background: "transparent", border: "1px solid var(--border-color-100)", color: "var(--secondary-text)" }}>
            URL
          </Tag>
        </Tooltip>
      )}
      <span style={{ flex: 1 }} />
      <Tooltip title="Edit">
        <EditOutlined
          onClick={onEdit}
          style={{ color: "var(--secondary-text)", fontSize: 13, cursor: "pointer" }}
        />
      </Tooltip>
      <Popconfirm title="Remove this model?" onConfirm={onRemove} okText="Remove" cancelText="Cancel">
        <DeleteOutlined style={{ color: "var(--secondary-text)", fontSize: 13, cursor: "pointer" }} />
      </Popconfirm>
    </div>
  );
};

const ModelEditCard = ({ model, index, onSave, onCancel, modelSuggestions }) => {
  const [draft, setDraft] = useState({ ...model });
  const isOrchestrator = index === 0;
  const providerMeta = PROVIDER_META[draft.provider] || {};
  const showBaseURL = draft.provider === "openai-compatible" || !!draft.baseURL;

  return (
    <div style={{
      padding: "16px 18px",
      marginBottom: 6,
      borderRadius: 8,
      border: `1px solid ${isOrchestrator ? "rgba(142, 53, 255, 0.45)" : "rgba(88, 166, 255, 0.3)"}`,
      backgroundColor: isOrchestrator ? "rgba(142, 53, 255, 0.05)" : "var(--surface-hover)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
        <EditOutlined style={{ fontSize: 11, color: "#58a6ff" }} />
        <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--primary-text)" }}>
          Editing — {model.label || "model"}
        </span>
        {isOrchestrator && (
          <Tag color="purple" style={{ margin: 0, fontSize: "0.58rem", fontWeight: 700, lineHeight: "14px" }}>
            ORCHESTRATOR
          </Tag>
        )}
      </div>
      <Form layout="vertical" requiredMark={false}>
        {/* Row 1: Label · Provider · Model */}
        <Row gutter={[14, 0]}>
          <Col span={7}>
            <Form.Item label="Label" style={{ marginBottom: 12 }}>
              <Input
                placeholder="e.g. Claude Sonnet"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </Form.Item>
          </Col>
          <Col span={7}>
            <Form.Item label="Provider" style={{ marginBottom: 12 }}>
              <Select
                value={draft.provider}
                onChange={(val) => setDraft({ ...draft, provider: val, model: "" })}
                options={PROVIDER_OPTIONS}
                style={{ width: "100%" }}
                popupMatchSelectWidth={false}
              />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item label="Model" style={{ marginBottom: 12 }}>
              <AutoComplete
                placeholder="e.g. gpt-5.5"
                value={draft.model}
                onChange={(val) => setDraft({ ...draft, model: val })}
                options={(modelSuggestions[draft.provider] || []).map((m) => ({ value: m, label: m }))}
                filterOption={(input, option) =>
                  (option?.value ?? "").toLowerCase().includes(input.toLowerCase())
                }
                allowClear
              />
            </Form.Item>
          </Col>
        </Row>

        {/* Row 2: Reasoning · API Key · Base URL (conditional) */}
        <Row gutter={[14, 0]}>
          <Col span={6}>
            <Form.Item label="Reasoning" style={{ marginBottom: 12 }}>
              <Select
                value={draft.reasoningMode || "off"}
                onChange={(val) => setDraft({ ...draft, reasoningMode: val })}
                options={REASONING_OPTIONS}
                style={{ width: "100%" }}
              />
            </Form.Item>
          </Col>
          <Col span={showBaseURL ? 9 : 18}>
            <Form.Item label="API Key" style={{ marginBottom: 12 }}>
              <Input.Password
                placeholder="Optional — leave blank to keep current"
                value={draft.apiKey}
                onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
                visibilityToggle
                autoComplete="off"
              />
            </Form.Item>
          </Col>
          {showBaseURL && (
            <Col span={9}>
              <Form.Item label="Base URL" style={{ marginBottom: 12 }}>
                <Input
                  placeholder="https://api.groq.com/openai/v1"
                  value={draft.baseURL}
                  onChange={(e) => setDraft({ ...draft, baseURL: e.target.value })}
                />
              </Form.Item>
            </Col>
          )}
        </Row>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
          <div>
            {providerMeta.keyURL && (
              <a href={providerMeta.keyURL} target="_blank" rel="noopener noreferrer" className={styles.externalLink}>
                <ExportOutlined style={{ fontSize: 11 }} /> {providerMeta.keyLabel}
              </a>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <PrimaryButton onClick={onCancel} style={{ height: 30, fontSize: "0.75rem" }}>
              <CloseOutlined /> Cancel
            </PrimaryButton>
            <PrimaryButton
              purple
              onClick={() => {
                if (!draft.label || !draft.provider || !draft.model) return;
                onSave(draft);
              }}
              style={{ height: 30, fontSize: "0.75rem" }}
            >
              <CheckOutlined /> Save
            </PrimaryButton>
          </div>
        </div>
      </Form>
    </div>
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

  const [models, setModels] = useState(null);
  const [adding, setAdding] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [newModel, setNewModel] = useState({ ...EMPTY_MODEL });
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [oauthState, setOauthState] = useState(null);

  const currentModels = models ?? data?.models ?? [];

  const modelSuggestions = useMemo(() => {
    const map = { ...FALLBACK_MODELS };
    if (catalog?.providers) {
      for (const cp of catalog.providers) {
        let ids = cp.models.map((m) => m.modelId);
        if (cp.id === "anthropic") {
          ids = ids.map((id) => id.replace(/(\d+)\.(\d+)/g, "$1-$2"));
        }
        const seen = new Set(map[cp.id] || []);
        const merged = [...seen];
        for (const id of ids) {
          if (!seen.has(id)) { merged.push(id); seen.add(id); }
        }
        map[cp.id] = merged;
      }
    }
    return map;
  }, [catalog]);

  const updateMutation = useMutation(updateModels, {
    onSuccess: () => {
      message.success("Models updated");
      queryClient.invalidateQueries("unified-models");
    },
    onError: (err) => {
      notification.error({ message: "Error", description: err?.response?.data?.message ?? "Failed to update" });
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
      message.success("Claude account connected");
      setShowCodeModal(false);
      setOauthState(null);
    },
    onError: (err) => {
      notification.error({ message: "OAuth Error", description: err?.response?.data?.message ?? "Failed to exchange code" });
    },
  });

  const persist = useCallback((updated) => {
    setModels(updated);
    updateMutation.mutate({ models: updated });
  }, [updateMutation]);

  if (isLoading) return <Loader />;

  const handleAdd = () => {
    if (!newModel.label || !newModel.provider || !newModel.model) {
      message.warning("Label, provider, and model are required");
      return;
    }
    const entry = { ...newModel };
    if (!entry.apiKey) delete entry.apiKey;
    if (!entry.baseURL) delete entry.baseURL;
    persist([...currentModels, entry]);
    setNewModel({ ...EMPTY_MODEL });
    setAdding(false);
  };

  const handleRemove = (index) => {
    if (editingIndex === index) setEditingIndex(null);
    persist(currentModels.filter((_, i) => i !== index));
  };

  const handleSaveEdit = (index, updated) => {
    const entry = { ...updated };
    if (!entry.apiKey) delete entry.apiKey;
    if (!entry.baseURL) delete entry.baseURL;
    const arr = [...currentModels];
    arr[index] = entry;
    persist(arr);
    setEditingIndex(null);
  };

  const handleMove = (from, to) => {
    const arr = [...currentModels];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    persist(arr);
  };

  const providerMeta = PROVIDER_META[newModel.provider] || {};

  return (
    <div className={styles.settingsContainer}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <CrownFilled style={{ color: "#8e35ff", fontSize: 14 }} />
        <strong style={{ fontSize: "0.82rem", color: "var(--primary-text, #fff)" }}>Models</strong>
        <Tag
          style={{
            margin: 0, fontSize: "0.6rem", padding: "0 4px", lineHeight: "16px",
            background: currentModels.length > 0 ? "rgba(142, 53, 255, 0.12)" : "var(--surface-hover)",
            border: `1px solid ${currentModels.length > 0 ? "rgba(142, 53, 255, 0.25)" : "var(--border-color-100)"}`,
            color: currentModels.length > 0 ? "#8e35ff" : "var(--secondary-text)",
          }}
        >
          {currentModels.length} model{currentModels.length !== 1 ? "s" : ""}
        </Tag>
      </div>

      <div className={styles.infoBox} style={{ marginBottom: 14 }}>
        <InfoCircleOutlined />
        <span>
          The <strong>first model</strong> is the orchestrator that runs the main session.
          All other models are <strong>racers</strong> that run in parallel on every user message,
          competing to find the best solution. Configure <strong>reasoning mode</strong> per model and drag to reorder.
        </span>
      </div>

      {currentModels.length === 0 && !adding ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No models configured — using server defaults"
          style={{ margin: "24px 0" }}
        >
          <PrimaryButton purple onClick={() => setAdding(true)} style={{ height: 32, fontSize: "0.75rem" }}>
            <PlusOutlined /> Add Model
          </PrimaryButton>
        </Empty>
      ) : (
        <>
          {currentModels.map((m, i) =>
            editingIndex === i ? (
              <ModelEditCard
                key={`edit-${i}`}
                model={m}
                index={i}
                modelSuggestions={modelSuggestions}
                onSave={(updated) => handleSaveEdit(i, updated)}
                onCancel={() => setEditingIndex(null)}
              />
            ) : (
              <ModelCard
                key={`${m.label}-${m.model}-${i}`}
                model={m}
                index={i}
                total={currentModels.length}
                onRemove={() => handleRemove(i)}
                onEdit={() => { setEditingIndex(i); setAdding(false); }}
                onMoveUp={() => handleMove(i, i - 1)}
                onMoveDown={() => handleMove(i, i + 1)}
              />
            ),
          )}

          {adding ? (
            <div style={{
              padding: "16px 18px", marginTop: 8, borderRadius: 8,
              border: "1px solid var(--border-color-100)", backgroundColor: "var(--surface-hover)",
            }}>
              <Form layout="vertical" requiredMark={false}>
                {/* Row 1: Label · Provider · Model */}
                <Row gutter={[14, 0]}>
                  <Col span={7}>
                    <Form.Item label="Label" style={{ marginBottom: 12 }}>
                      <Input
                        placeholder="e.g. Claude Sonnet"
                        value={newModel.label}
                        onChange={(e) => setNewModel({ ...newModel, label: e.target.value })}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={7}>
                    <Form.Item label="Provider" style={{ marginBottom: 12 }}>
                      <Select
                        value={newModel.provider}
                        onChange={(val) => setNewModel({ ...newModel, provider: val, model: "" })}
                        options={PROVIDER_OPTIONS}
                        style={{ width: "100%" }}
                        popupMatchSelectWidth={false}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={10}>
                    <Form.Item label="Model" style={{ marginBottom: 12 }}>
                      <AutoComplete
                        placeholder="e.g. gpt-5.5"
                        value={newModel.model}
                        onChange={(val) => setNewModel({ ...newModel, model: val })}
                        options={(modelSuggestions[newModel.provider] || []).map((m) => ({ value: m, label: m }))}
                        filterOption={(input, option) =>
                          (option?.value ?? "").toLowerCase().includes(input.toLowerCase())
                        }
                        allowClear
                      />
                    </Form.Item>
                  </Col>
                </Row>

                {/* Row 2: Reasoning · API Key · Base URL (conditional) */}
                <Row gutter={[14, 0]}>
                  <Col span={6}>
                    <Form.Item label="Reasoning" style={{ marginBottom: 12 }}>
                      <Select
                        value={newModel.reasoningMode}
                        onChange={(val) => setNewModel({ ...newModel, reasoningMode: val })}
                        options={REASONING_OPTIONS}
                        style={{ width: "100%" }}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={newModel.provider === "openai-compatible" ? 9 : 18}>
                    <Form.Item label="API Key" style={{ marginBottom: 12 }}>
                      <Input.Password
                        placeholder="Optional"
                        value={newModel.apiKey}
                        onChange={(e) => setNewModel({ ...newModel, apiKey: e.target.value })}
                        visibilityToggle
                        autoComplete="off"
                      />
                    </Form.Item>
                  </Col>
                  {newModel.provider === "openai-compatible" && (
                    <Col span={9}>
                      <Form.Item label="Base URL" style={{ marginBottom: 12 }}>
                        <Input
                          placeholder="https://api.groq.com/openai/v1"
                          value={newModel.baseURL}
                          onChange={(e) => setNewModel({ ...newModel, baseURL: e.target.value })}
                        />
                      </Form.Item>
                    </Col>
                  )}
                </Row>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {newModel.provider === "anthropic" && (
                      <PrimaryButton
                        onClick={() => initOAuthMutation.mutate({})}
                        loading={initOAuthMutation.isLoading}
                        style={{ height: 28, fontSize: "0.72rem" }}
                      >
                        <LinkOutlined /> Connect via Claude OAuth
                      </PrimaryButton>
                    )}
                    {providerMeta.keyURL && (
                      <a href={providerMeta.keyURL} target="_blank" rel="noopener noreferrer" className={styles.externalLink}>
                        <ExportOutlined style={{ fontSize: 11 }} /> {providerMeta.keyLabel}
                      </a>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <PrimaryButton
                      onClick={() => { setAdding(false); setNewModel({ ...EMPTY_MODEL }); }}
                      style={{ height: 30, fontSize: "0.75rem" }}
                    >
                      Cancel
                    </PrimaryButton>
                    <PrimaryButton
                      purple
                      onClick={handleAdd}
                      loading={updateMutation.isLoading}
                      style={{ height: 30, fontSize: "0.75rem" }}
                    >
                      Add
                    </PrimaryButton>
                  </div>
                </div>
              </Form>
            </div>
          ) : (
            <PrimaryButton
              onClick={() => { setAdding(true); setEditingIndex(null); }}
              style={{ height: 28, fontSize: "0.72rem", marginTop: 8 }}
            >
              <PlusOutlined /> Add Model
            </PrimaryButton>
          )}
        </>
      )}

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
