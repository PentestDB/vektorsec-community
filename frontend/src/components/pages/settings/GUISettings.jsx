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
  message,
  notification,
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

const AUTO_SETUP_STEPS = [
  { title: "Connecting to exploit box", icon: <CloudServerOutlined /> },
  { title: "Installing VNC & GUI packages", icon: <SettingOutlined /> },
  { title: "Configuring VNC server", icon: <DesktopOutlined /> },
  { title: "Starting VNC server (DISPLAY=:89)", icon: <PlayCircleOutlined /> },
  { title: "Starting noVNC proxy", icon: <ApiOutlined /> },
];

const GUISettingsPage = () => {
  const [form] = Form.useForm();
  const [advForm] = Form.useForm();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery("vnc-config", getVNCConfig);
  const [setupMode, setSetupMode] = useState(null);
  const [currentStep, setCurrentStep] = useState(-1);
  const [diagResults, setDiagResults] = useState(null);

  const diagnoseMutation = useMutation(diagnoseVNC, {
    onSuccess: (data) => {
      setDiagResults(data);
      if (data.allPassed) {
        message.success("All checks passed");
      }
    },
    onError: (err) => {
      notification.error({
        message: "Diagnostics Failed",
        description: err?.response?.data?.message ?? "Could not run diagnostics. Check SSH settings.",
      });
    },
  });

  const repairMutation = useMutation(repairVNC, {
    onSuccess: (data) => {
      setDiagResults(data);
      if (data.allPassed) {
        message.success("Repair successful — all checks pass now");
      } else {
        message.warning("Repair completed but some checks still fail");
      }
    },
    onError: (err) => {
      notification.error({
        message: "Repair Failed",
        description: err?.response?.data?.message ?? "Could not repair VNC. Check SSH settings.",
      });
    },
  });

  const saveMutation = useMutation(updateVNCConfig, {
    onSuccess: () => {
      message.success("VNC configuration saved");
      queryClient.invalidateQueries("vnc-config");
    },
    onError: (err) => {
      notification.error({
        message: "Error",
        description: err?.response?.data?.message ?? "Failed to save VNC config",
      });
    },
  });

  const resetMutation = useMutation(resetVNCConfig, {
    onSuccess: () => {
      message.success("VNC configuration reset");
      queryClient.invalidateQueries("vnc-config");
      form.resetFields();
      setSetupMode(null);
      setCurrentStep(-1);
    },
    onError: (err) => {
      notification.error({
        message: "Error",
        description: err?.response?.data?.message ?? "Failed to reset",
      });
    },
  });

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
      message.success("VNC setup completed! You can now use the GUI tab.");
      queryClient.invalidateQueries("vnc-config");
    },
    onError: (err, _vars, interval) => {
      if (interval) clearInterval(interval);
      setCurrentStep(-1);
      notification.error({
        message: "Auto-Setup Failed",
        description:
          err?.response?.data?.message ??
          "Failed to auto-setup VNC. Make sure SSH is configured and the exploit box has internet access.",
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
    autoSetupMutation.mutate();
  };

  return (
    <div className={styles.settingsContainer}>
      <div className={styles.statusRow}>
        {configured ? (
          <Tag icon={<CheckCircleFilled />} color="success">
            {data.mode === "auto" ? "Auto-Configured" : "Configured (Manual)"}
          </Tag>
        ) : (
          <Tag icon={<WarningOutlined />} color="warning">
            Not Configured
          </Tag>
        )}
        {configured && (
          <Button
            type="default"
            size="small"
            icon={<SearchOutlined />}
            loading={diagnoseMutation.isLoading}
            onClick={() => diagnoseMutation.mutate()}
          >
            Diagnose
          </Button>
        )}
        {configured && (
          <Popconfirm
            title="Reset VNC configuration?"
            description="This will remove saved VNC settings. You'll need to set up again."
            onConfirm={() => resetMutation.mutate({})}
            okText="Reset"
            cancelText="Cancel"
          >
            <Tooltip title="Reset VNC config">
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
            VNC is auto-configured on{" "}
            <strong>{data.baseUrl || `${data.host}:${data.port}`}</strong>.
            The GUI desktop will start automatically when you open a GUI session.
          </span>
        </div>
      )}

      {configured && data.mode === "manual" && (
        <div className={styles.infoBox}>
          <CheckCircleFilled style={{ color: "#52c41a" }} />
          <span>
            VNC is configured to connect to{" "}
            <strong>{data.baseUrl || `${data.host}:${data.port}`}</strong>.
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
              Diagnostics
            </span>
            {!diagResults.allPassed && (
              <Button
                type="primary"
                size="small"
                icon={<ToolOutlined />}
                loading={repairMutation.isLoading}
                onClick={() => repairMutation.mutate({ fix: "all" })}
                style={{
                  background: "var(--primary-purple, #7c3aed)",
                  borderColor: "var(--primary-purple, #7c3aed)",
                  fontSize: "0.72rem",
                  height: 28,
                }}
              >
                Repair All
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
              All checks passed — VNC services are healthy.
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
            Advanced
          </div>
          <div className={styles.infoBox} style={{ marginBottom: "0.75rem" }}>
            <InfoCircleOutlined />
            <span>
              Base URL must be reachable from your <strong>browser</strong>. Use{" "}
              <code>localhost</code> if running locally, or your VPN hostname if behind a VPN.
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
                  label="noVNC Host"
                  rules={[{ required: true, message: "Host is required" }]}
                >
                  <Input placeholder="e.g. localhost or 192.168.1.100" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  name="port"
                  label="Port"
                  rules={[{ required: true, message: "Port required" }]}
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
                  VNC Password
                  <Tooltip title="Use alphanumeric only to avoid connection errors. Leave blank to keep current.">
                    <InfoCircleOutlined style={{ color: "var(--secondary-text)", fontSize: "0.7rem" }} />
                  </Tooltip>
                </span>
              }
            >
              <Input.Password placeholder="Leave blank to keep current" />
            </Form.Item>
            <Form.Item
              name="baseUrl"
              label={
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  Base URL Override
                  <Tooltip title="Overrides host:port when set. Use full URL (e.g. http://localhost:9020). Leave empty to use host:port above.">
                    <InfoCircleOutlined style={{ color: "var(--secondary-text)", fontSize: "0.7rem" }} />
                  </Tooltip>
                </span>
              }
            >
              <Input placeholder="e.g. http://localhost:9020 (leave empty to use host:port)" />
            </Form.Item>
            <Row justify="end">
              <PrimaryButton
                purple
                htmlType="submit"
                loading={saveMutation.isLoading}
                style={{ height: 30, fontSize: "0.75rem" }}
              >
                Save
              </PrimaryButton>
            </Row>
          </Form>
        </div>
      )}

      {!configured && (
        <>
          <div className={styles.infoBox}>
            <InfoCircleOutlined />
            <span>
              A GUI desktop lets you use graphical tools (browsers, Burp Suite, etc.) on
              your exploit box. Choose how to set it up:
            </span>
          </div>

          <Form.Item
            label="Setup Mode"
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
                <PlayCircleOutlined /> One-Click Setup
              </Radio.Button>
              <Radio.Button
                value="manual"
                style={{ fontSize: "0.72rem", height: 30, lineHeight: "28px" }}
              >
                <SettingOutlined /> Manual (Existing VNC)
              </Radio.Button>
            </Radio.Group>
          </Form.Item>
        </>
      )}

      {!configured && activeMode === "auto" && (
        <>
          <div className={styles.infoBox}>
            <InfoCircleOutlined />
            <span>
              This will install a VNC server (TigerVNC / Xvnc) and noVNC web client on
              your exploit box via SSH.               A lightweight GUI session (xterm) is started by
              default; if Xfce or Openbox is available it will be used instead. DISPLAY=:89
              is always set. Requires internet access on the exploit box and SSH to be configured.
            </span>
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
                      {step.title}
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
              <span>
                Setup complete! VNC desktop is ready. Open a GUI session to start using it.
              </span>
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
                <PlayCircleOutlined /> {isAutoRunning ? "Setting up..." : "Start Auto-Setup"}
              </PrimaryButton>
            </Col>
          </Row>
        </>
      )}

      {!configured && activeMode === "manual" && (
        <>
          <div className={styles.infoBox}>
            <InfoCircleOutlined />
            <span>
              If you already have a VNC/noVNC server running on your exploit box,
              enter the connection details below.
            </span>
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
                  label="noVNC Host"
                  rules={[{ required: true, message: "Host is required" }]}
                >
                  <Input placeholder="e.g. 192.168.1.100 or localhost" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  name="port"
                  label="Port"
                  rules={[{ required: true, message: "Port required" }]}
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
                  VNC Password
                  <Tooltip title="Use alphanumeric only. Special characters (e.g. !@#) can cause connection errors.">
                    <InfoCircleOutlined style={{ color: "var(--secondary-text)", fontSize: "0.7rem" }} />
                  </Tooltip>
                </span>
              }
              rules={[{ required: true, message: "Password is required" }]}
            >
              <Input.Password placeholder="Enter VNC password" />
            </Form.Item>

            <Form.Item
              name="baseUrl"
              label={
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  Base URL Override
                  <Tooltip title="Optional. Must be reachable from your browser (e.g. localhost or your VPN hostname).">
                    <InfoCircleOutlined style={{ color: "var(--secondary-text)", fontSize: "0.7rem" }} />
                  </Tooltip>
                </span>
              }
            >
              <Input placeholder="e.g. http://localhost:9020 or http://192.168.1.100:9020" />
            </Form.Item>

            <Row justify="end" style={{ marginTop: 4 }}>
              <Col>
                <PrimaryButton
                  purple
                  htmlType="submit"
                  loading={saveMutation.isLoading}
                  style={{ height: 34, fontSize: "0.78rem" }}
                >
                  Save Configuration
                </PrimaryButton>
              </Col>
            </Row>
          </Form>
        </>
      )}

      <Divider style={{ borderColor: "var(--border-color-100)", margin: "1.25rem 0 0.75rem" }} />

      <div className={styles.notesSection}>
        <strong>About GUI / VNC</strong>
        <ul>
          <li>
            <strong>One-Click Setup</strong> installs TigerVNC (Xvnc) + noVNC on
            your exploit box with a lightweight GUI. Takes 1-2 minutes depending on internet speed.
          </li>
          <li>
            <strong>Manual mode</strong> connects to an existing noVNC instance — use this
            if you've already set up VNC yourself.
          </li>
          <li>
            <strong>Base URL Override</strong> must be reachable from your browser (e.g. localhost or VPN hostname).
          </li>
          <li>
            The GUI session is accessible from the <code>/gui</code> tab in any session.
          </li>
          <li>
            SSH / Exploit Box must be configured before auto-setup can work.
          </li>
        </ul>
      </div>
    </div>
  );
};

export default GUISettingsPage;
