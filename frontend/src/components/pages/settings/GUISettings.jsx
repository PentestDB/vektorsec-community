"use client";

import { useState, useEffect } from "react";
import {
  Form,
  Input,
  InputNumber,
  Row,
  Col,
  Tag,
  Button,
  App,
  Divider,
  Tooltip,
  Popconfirm,
  Steps,
  Radio,
} from "antd";
import {
  CheckCircleFilled,
  CloseCircleFilled,
  MinusCircleOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  LoadingOutlined,
  DesktopOutlined,
  CloudServerOutlined,
  SettingOutlined,
  PlayCircleOutlined,
  ApiOutlined,
  WarningOutlined,
  MedicineBoxOutlined,
  SearchOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import PrimaryButton from "@/components/common/PrimaryButton";
import Loader from "@/components/common/loader/Loader";
import RichText from "@/components/common/RichText";
import { useTranslation } from "@/i18n/I18nProvider";
import styles from "@/styles/pages/Settings.module.scss";
import { useMutation, useQuery, useQueryClient } from "react-query";
import {
  getVNCConfig,
  updateVNCConfig,
  resetVNCConfig,
  autoSetupVNC,
  diagnoseVNC,
  repairVNC,
} from "@/services/user.service";

/** Auto-setup progress titles; `titleKey` is resolved with `t` at render time. */
const AUTO_SETUP_STEPS = [
  { titleKey: "guiSettings.stepConnect", icon: <CloudServerOutlined /> },
  { titleKey: "guiSettings.stepInstall", icon: <SettingOutlined /> },
  { titleKey: "guiSettings.stepConfigure", icon: <DesktopOutlined /> },
  { titleKey: "guiSettings.stepStart", icon: <PlayCircleOutlined /> },
  { titleKey: "guiSettings.stepProxy", icon: <ApiOutlined /> },
];

const GUISettingsPage = ({ sessionId }) => {
  const { t } = useTranslation();
  const { message, notification } = App.useApp();
  const [form] = Form.useForm();
  const [advForm] = Form.useForm();
  const queryClient = useQueryClient();
  const vncQueryKey = ["vnc-config", sessionId || "global"];
  const { data, isLoading } = useQuery(vncQueryKey, () => getVNCConfig(sessionId));
  const [setupMode, setSetupMode] = useState(null);
  const [currentStep, setCurrentStep] = useState(-1);
  const [diagResults, setDiagResults] = useState(null);

  const diagnoseMutation = useMutation(diagnoseVNC, {
    onSuccess: (data) => {
      setDiagResults(data);
      if (data.allPassed) {
        message.success(t("guiSettings.allChecksPassed"));
      }
    },
    onError: (err) => {
      notification.error({
        message: t("guiSettings.diagnosticsFailed"),
        description:
          err?.response?.data?.message ?? t("guiSettings.diagnosticsFailedBody"),
      });
    },
  });

  const repairMutation = useMutation(repairVNC, {
    onSuccess: (data) => {
      setDiagResults(data);
      if (data.allPassed) {
        message.success(t("guiSettings.repairSuccess"));
      } else {
        message.warning(t("guiSettings.repairPartial"));
      }
    },
    onError: (err) => {
      notification.error({
        message: t("guiSettings.repairFailed"),
        description:
          err?.response?.data?.message ?? t("guiSettings.repairFailedBody"),
      });
    },
  });

  const saveMutation = useMutation(
    (body) => updateVNCConfig({ ...body, ...(sessionId ? { sessionId } : {}) }),
    {
      onSuccess: () => {
        message.success(t("guiSettings.saved"));
        queryClient.invalidateQueries(vncQueryKey);
      },
      onError: (err) => {
        notification.error({
          message: t("common.error"),
          description: err?.response?.data?.message ?? t("guiSettings.saveFailed"),
        });
      },
    },
  );

  const resetMutation = useMutation(
    (body) => resetVNCConfig({ ...body, ...(sessionId ? { sessionId } : {}) }),
    {
      onSuccess: () => {
        message.success(t("guiSettings.resetDone"));
        queryClient.invalidateQueries(vncQueryKey);
        form.resetFields();
        setSetupMode(null);
        setCurrentStep(-1);
      },
      onError: (err) => {
        notification.error({
          message: t("common.error"),
          description: err?.response?.data?.message ?? t("guiSettings.resetFailed"),
        });
      },
    },
  );

  const autoSetupMutation = useMutation(autoSetupVNC, {
    onMutate: () => {
      setCurrentStep(0);
      const interval = setInterval(() => {
        setCurrentStep((prev) => {
          if (prev >= AUTO_SETUP_STEPS.length - 1) {
            clearInterval(interval);
            return prev;
          }
          return prev + 1;
        });
      }, 8000);
      return interval;
    },
    onSuccess: (data) => {
      setCurrentStep(AUTO_SETUP_STEPS.length);
      message.success(t("guiSettings.setupCompleted"));
      queryClient.invalidateQueries(vncQueryKey);
    },
    onError: (err, _vars, interval) => {
      if (interval) clearInterval(interval);
      setCurrentStep(-1);
      notification.error({
        message: t("guiSettings.setupFailedTitle"),
        description:
          err?.response?.data?.message ?? t("guiSettings.setupFailedBody"),
        duration: 8,
      });
    },
  });

  const configured = data?.configured;
  const activeMode = setupMode ?? data?.mode ?? null;
  const isAutoRunning = autoSetupMutation.isLoading;

  useEffect(() => {
    if (data && (data.mode === "manual" || activeMode === "manual")) {
      form.setFieldsValue({
        host: data.host || "",
        port: parseInt(data.port, 10) || 9020,
        password: data.password || "",
        baseUrl: data.baseUrl || "",
      });
    }
  }, [data, activeMode, form]);

  if (isLoading) return <Loader />;

  const handleManualSubmit = (values) => {
    saveMutation.mutate({
      mode: "manual",
      host: values.host,
      port: values.port || 9020,
      password: values.password,
      baseUrl: values.baseUrl?.trim() || undefined,
    });
  };

  const handleAutoSetup = () => {
    autoSetupMutation.mutate({ sessionId });
  };

  return (
    <div className={styles.settingsContainer}>
      <div className={styles.statusRow}>
        {configured ? (
          <Tag icon={<CheckCircleFilled />} color="success">
            {data.mode === "auto"
              ? t("guiSettings.statusAuto")
              : t("guiSettings.statusManual")}
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
            icon={<SearchOutlined />}
            loading={diagnoseMutation.isLoading}
            onClick={() => diagnoseMutation.mutate({ sessionId })}
          >
            {t("guiSettings.diagnose")}
          </Button>
        )}
        {configured && (
          <Popconfirm
            title={t("guiSettings.resetTitle")}
            description={t("guiSettings.resetBody")}
            onConfirm={() => resetMutation.mutate({})}
            okText={t("guiSettings.resetAction")}
            cancelText={t("common.cancel")}
          >
            <Tooltip title={t("guiSettings.resetTooltip")}>
              <DeleteOutlined
                style={{ color: "var(--secondary-text)", fontSize: 14, cursor: "pointer" }}
              />
            </Tooltip>
          </Popconfirm>
        )}
      </div>

      {configured && data.mode === "auto" && (
        <div className={styles.infoBox}>
          <CheckCircleFilled style={{ color: "#52c41a" }} />
          <span>
            <RichText
              text={t("guiSettings.autoInfo", {
                target: data.baseUrl || `${data.host}:${data.port}`,
              })}
            />
          </span>
        </div>
      )}

      {configured && data.mode === "manual" && (
        <div className={styles.infoBox}>
          <CheckCircleFilled style={{ color: "#52c41a" }} />
          <span>
            <RichText
              text={t("guiSettings.manualInfo", {
                target: data.baseUrl || `${data.host}:${data.port}`,
              })}
            />
          </span>
        </div>
      )}

      {configured && diagResults && (
        <div style={{
          marginBottom: "1.25rem",
          border: "1px solid var(--border-color-100)",
          borderRadius: 8,
          padding: "0.85rem 1rem",
          background: "var(--surface-hover)",
        }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.6rem",
          }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--primary-text)" }}>
              <MedicineBoxOutlined style={{ marginRight: 6 }} />
              {t("guiSettings.diagnosticsTitle")}
            </span>
            {!diagResults.allPassed && (
              <Button
                type="primary"
                size="small"
                icon={<ToolOutlined />}
                loading={repairMutation.isLoading}
                onClick={() => repairMutation.mutate({ sessionId, fix: "all" })}
                style={{
                  background: "var(--primary-purple, #7c3aed)",
                  borderColor: "var(--primary-purple, #7c3aed)",
                  fontSize: "0.72rem",
                  height: 28,
                }}
              >
                {t("guiSettings.repairAll")}
              </Button>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {diagResults.checks?.map((check) => (
              <div
                key={check.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: "0.78rem",
                  lineHeight: 1.4,
                }}
              >
                {check.status === "pass" && (
                  <CheckCircleFilled style={{ color: "#52c41a", fontSize: 14, flexShrink: 0 }} />
                )}
                {check.status === "fail" && (
                  <CloseCircleFilled style={{ color: "#ff4d4f", fontSize: 14, flexShrink: 0 }} />
                )}
                {check.status === "skip" && (
                  <MinusCircleOutlined style={{ color: "var(--secondary-text)", fontSize: 14, flexShrink: 0 }} />
                )}
                <span style={{ color: "var(--primary-text)" }}>
                  {check.label}
                </span>
                <span style={{
                  color: check.status === "fail" ? "#ff4d4f" : "var(--secondary-text)",
                  fontSize: "0.72rem",
                  marginLeft: "auto",
                  textAlign: "right",
                  flexShrink: 0,
                  maxWidth: "50%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {check.detail}
                </span>
              </div>
            ))}
          </div>
          {diagResults.allPassed && (
            <div style={{
              marginTop: "0.5rem",
              fontSize: "0.75rem",
              color: "#52c41a",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}>
              <CheckCircleFilled />
              {t("guiSettings.allHealthy")}
            </div>
          )}
          {diagResults.repairLog && diagResults.repairLog.length > 0 && (
            <div style={{
              marginTop: "0.6rem",
              padding: "0.5rem 0.65rem",
              background: "var(--cli-bg, #1a1a2e)",
              borderRadius: 6,
              fontSize: "0.7rem",
              fontFamily: "'JetBrains Mono', monospace",
              color: "var(--secondary-text)",
              lineHeight: 1.6,
            }}>
              {diagResults.repairLog.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {configured && (
        <div style={{ marginBottom: "1.25rem" }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--secondary-text)", marginBottom: "0.75rem" }}>
            {t("guiSettings.advancedTitle")}
          </div>
          <div className={styles.infoBox} style={{ marginBottom: "0.75rem" }}>
            <InfoCircleOutlined />
            <span>
              <RichText text={t("guiSettings.baseUrlHint")} />
            </span>
          </div>
          <Form
            form={advForm}
            key={`override-${data?.host ?? ""}-${data?.port ?? ""}-${data?.baseUrl ?? ""}`}
            layout="vertical"
            initialValues={{
              host: data?.host || "",
              port: data?.port != null ? parseInt(String(data.port), 10) || 9020 : 9020,
              password: data?.password || "",
              baseUrl: data?.baseUrl || "",
            }}
            onFinish={(values) =>
              saveMutation.mutate({
                mode: data.mode,
                host: values.host?.trim() || data.host,
                port: values.port || data.port || 9020,
                password: values.password || data.password,
                baseUrl: values.baseUrl?.trim() || "",
              })
            }
            requiredMark={false}
          >
            <Row gutter={16}>
              <Col span={16}>
                <Form.Item
                  name="host"
                  label={t("guiSettings.hostLabel")}
                  rules={[{ required: true, message: t("common.hostRequired") }]}
                >
                  <Input placeholder={t("guiSettings.hostPlaceholderAdvanced")} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  name="port"
                  label={t("common.portLabel")}
                  rules={[{ required: true, message: t("common.portRequired") }]}
                >
                  <InputNumber
                    min={1}
                    max={65535}
                    style={{ width: "100%" }}
                    placeholder="9020"
                  />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item
              name="password"
              label={
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {t("guiSettings.passwordLabel")}
                  <Tooltip title={t("guiSettings.passwordTooltipAdvanced")}>
                    <InfoCircleOutlined style={{ color: "var(--secondary-text)", fontSize: "0.7rem" }} />
                  </Tooltip>
                </span>
              }
            >
              <Input.Password placeholder={t("guiSettings.passwordPlaceholderKeep")} />
            </Form.Item>
            <Form.Item
              name="baseUrl"
              label={
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {t("guiSettings.baseUrlLabel")}
                  <Tooltip title={t("guiSettings.baseUrlTooltipAdvanced")}>
                    <InfoCircleOutlined style={{ color: "var(--secondary-text)", fontSize: "0.7rem" }} />
                  </Tooltip>
                </span>
              }
            >
              <Input placeholder={t("guiSettings.baseUrlPlaceholderAdvanced")} />
            </Form.Item>
            <Row justify="end">
              <PrimaryButton
                purple
                htmlType="submit"
                loading={saveMutation.isLoading}
                style={{ height: 30, fontSize: "0.75rem" }}
              >
                {t("common.save")}
              </PrimaryButton>
            </Row>
          </Form>
        </div>
      )}

      {!configured && (
        <>
          <div className={styles.infoBox}>
            <InfoCircleOutlined />
            <span>{t("guiSettings.intro")}</span>
          </div>

          <Form.Item
            label={t("guiSettings.setupModeLabel")}
            style={{ marginBottom: 16 }}
          >
            <Radio.Group
              value={activeMode}
              onChange={(e) => setSetupMode(e.target.value)}
              size="small"
              style={{ display: "flex", gap: 12 }}
              disabled={isAutoRunning}
            >
              <Radio.Button
                value="auto"
                style={{ fontSize: "0.72rem", height: 30, lineHeight: "28px" }}
              >
                <PlayCircleOutlined /> {t("guiSettings.modeAuto")}
              </Radio.Button>
              <Radio.Button
                value="manual"
                style={{ fontSize: "0.72rem", height: 30, lineHeight: "28px" }}
              >
                <SettingOutlined /> {t("guiSettings.modeManual")}
              </Radio.Button>
            </Radio.Group>
          </Form.Item>
        </>
      )}

      {!configured && activeMode === "auto" && (
        <>
          <div className={styles.infoBox}>
            <InfoCircleOutlined />
            <span>{t("guiSettings.autoDescription")}</span>
          </div>

          {isAutoRunning && (
            <div style={{ margin: "1rem 0 1.5rem" }}>
              <Steps
                direction="vertical"
                size="small"
                current={currentStep}
                items={AUTO_SETUP_STEPS.map((step, i) => ({
                  title: (
                    <span style={{ color: "var(--primary-text)", fontSize: "0.78rem" }}>
                      {t(step.titleKey)}
                    </span>
                  ),
                  icon:
                    i === currentStep ? (
                      <LoadingOutlined style={{ color: "var(--primary-purple)" }} />
                    ) : i < currentStep ? (
                      <CheckCircleFilled style={{ color: "#52c41a" }} />
                    ) : (
                      step.icon
                    ),
                }))}
              />
            </div>
          )}

          {currentStep === AUTO_SETUP_STEPS.length && (
            <div className={styles.infoBox} style={{ borderColor: "#52c41a" }}>
              <CheckCircleFilled style={{ color: "#52c41a" }} />
              <span>{t("guiSettings.setupComplete")}</span>
            </div>
          )}

          <Row justify="end" style={{ marginTop: 8 }}>
            <Col>
              <PrimaryButton
                purple
                loading={isAutoRunning}
                disabled={isAutoRunning}
                onClick={handleAutoSetup}
                style={{ height: 34, fontSize: "0.78rem" }}
              >
                <PlayCircleOutlined />{" "}
                {isAutoRunning
                  ? t("guiSettings.settingUp")
                  : t("guiSettings.startAutoSetup")}
              </PrimaryButton>
            </Col>
          </Row>
        </>
      )}

      {!configured && activeMode === "manual" && (
        <>
          <div className={styles.infoBox}>
            <InfoCircleOutlined />
            <span>{t("guiSettings.manualDescription")}</span>
          </div>

          <Form
            form={form}
            layout="vertical"
            initialValues={{
              host: data?.host || "",
              port: parseInt(data?.port, 10) || 9020,
              password: data?.password || "",
              baseUrl: data?.baseUrl || "",
            }}
            onFinish={handleManualSubmit}
            requiredMark={false}
          >
            <Row gutter={16}>
              <Col span={16}>
                <Form.Item
                  name="host"
                  label={t("guiSettings.hostLabel")}
                  rules={[{ required: true, message: t("common.hostRequired") }]}
                >
                  <Input placeholder={t("guiSettings.hostPlaceholderManual")} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  name="port"
                  label={t("common.portLabel")}
                  rules={[{ required: true, message: t("common.portRequired") }]}
                >
                  <InputNumber
                    min={1}
                    max={65535}
                    style={{ width: "100%" }}
                    placeholder="9020"
                  />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              name="password"
              label={
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {t("guiSettings.passwordLabel")}
                  <Tooltip title={t("guiSettings.passwordTooltipManual")}>
                    <InfoCircleOutlined style={{ color: "var(--secondary-text)", fontSize: "0.7rem" }} />
                  </Tooltip>
                </span>
              }
              rules={[{ required: true, message: t("guiSettings.passwordRequired") }]}
            >
              <Input.Password placeholder={t("guiSettings.passwordPlaceholder")} />
            </Form.Item>

            <Form.Item
              name="baseUrl"
              label={
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {t("guiSettings.baseUrlLabel")}
                  <Tooltip title={t("guiSettings.baseUrlTooltipManual")}>
                    <InfoCircleOutlined style={{ color: "var(--secondary-text)", fontSize: "0.7rem" }} />
                  </Tooltip>
                </span>
              }
            >
              <Input placeholder={t("guiSettings.baseUrlPlaceholderManual")} />
            </Form.Item>

            <Row justify="end" style={{ marginTop: 4 }}>
              <Col>
                <PrimaryButton
                  purple
                  htmlType="submit"
                  loading={saveMutation.isLoading}
                  style={{ height: 34, fontSize: "0.78rem" }}
                >
                  {t("common.saveConfiguration")}
                </PrimaryButton>
              </Col>
            </Row>
          </Form>
        </>
      )}

      <Divider style={{ borderColor: "var(--border-color-100)", margin: "1.25rem 0 0.75rem" }} />

      <div className={styles.notesSection}>
        <strong>{t("guiSettings.aboutTitle")}</strong>
        <ul>
          <li>
            <RichText text={t("guiSettings.aboutOneClick")} />
          </li>
          <li>
            <RichText text={t("guiSettings.aboutManual")} />
          </li>
          <li>
            <RichText text={t("guiSettings.aboutBaseUrl")} />
          </li>
          <li>
            <RichText text={t("guiSettings.aboutTab")} />
          </li>
          <li>{t("guiSettings.aboutWorkspace")}</li>
        </ul>
      </div>
    </div>
  );
};

export default GUISettingsPage;
