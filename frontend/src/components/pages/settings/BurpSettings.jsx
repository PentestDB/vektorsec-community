"use client";

import { useState, useEffect } from "react";
import {
  Form,
  Input,
  InputNumber,
  Row,
  Col,
  Tag,
  message,
  Button,
} from "antd";
import {
  CheckCircleFilled,
  WarningOutlined,
  ApiOutlined,
} from "@ant-design/icons";
import PrimaryButton from "@/components/common/PrimaryButton";
import Loader from "@/components/common/loader/Loader";
import styles from "@/styles/pages/Settings.module.scss";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { getBurpConfig, updateBurpConfig } from "@/services/user.service";
import { getBurpProxyHistory } from "@/services/burp.service";

const BurpSettingsPage = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery("burp-config", getBurpConfig);

  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    if (data) {
      form.setFieldsValue({
        host: data.host,
        port: parseInt(data.port, 10) || 50051,
      });
    }
  }, [data, form]);

  const saveMutation = useMutation(updateBurpConfig, {
    onSuccess: () => {
      message.success("Burp configuration saved");
      queryClient.invalidateQueries("burp-config");
      setSaving(false);
    },
    onError: (err) => {
      message.error(err?.response?.data?.message || "Failed to save Burp config");
      setSaving(false);
    },
  });

  const onFinish = (values) => {
    setSaving(true);
    saveMutation.mutate({
      host: values.host,
      port: values.port || 50051,
    });
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await getBurpProxyHistory({ page: 1, pageSize: 1 });
      setTestResult({
        success: true,
        message: `Connected — ${result.total} proxy entries found`,
      });
    } catch (err) {
      setTestResult({
        success: false,
        message: err?.response?.data?.message || "Connection failed",
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
          <Tag icon={<CheckCircleFilled />} color="success">Configured</Tag>
        ) : (
          <Tag icon={<WarningOutlined />} color="warning">Not Configured</Tag>
        )}
        {configured && (
          <Button
            type="default"
            size="small"
            icon={<ApiOutlined />}
            loading={testing}
            onClick={handleTestConnection}
          >
            Test Connection
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
          host: data?.host || "",
          port: parseInt(data?.port, 10) || 50051,
        }}
      >
        <Row gutter={16}>
          <Col span={16}>
            <Form.Item
              label="Burp RPC Host"
              name="host"
              rules={[{ required: true, message: "Host is required" }]}
            >
              <Input placeholder="e.g. 10.69.0.4 or localhost" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label="Port"
              name="port"
              rules={[{ required: true, message: "Port required" }]}
            >
              <InputNumber
                min={1}
                max={65535}
                style={{ width: "100%" }}
                placeholder="50051"
              />
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
            Save Configuration
          </PrimaryButton>
        </div>
      </Form>

      <div className={styles.notesSection} style={{ marginTop: "1.25rem" }}>
        <ul>
          <li>
            The <strong>Burp RPC extension</strong> must be loaded in Burp Suite
            and listening on the configured host and port.
          </li>
          <li>
            Default port is <code>50051</code>. Use <code>0.0.0.0</code> binding
            in the extension to allow remote connections.
          </li>
          <li>
            Make sure the firewall on the Burp machine allows inbound traffic
            on the configured port.
          </li>
        </ul>
      </div>
    </div>
  );
};

export default BurpSettingsPage;
