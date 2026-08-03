"use client";

import { useEffect } from "react";
import { App, Form, InputNumber } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "react-query";
import Loader from "@/components/common/loader/Loader";
import PrimaryButton from "@/components/common/PrimaryButton";
import {
  getAgentBehaviorConfig,
  updateAgentBehaviorConfig,
} from "@/services/user.service";
import styles from "@/styles/pages/Settings.module.scss";

export default function AgentBehaviorPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const { data, isLoading } = useQuery(
    "agent-behavior-config",
    getAgentBehaviorConfig,
  );

  useEffect(() => {
    if (data) {
      form.setFieldsValue({
        maxAgentIterations: data.maxAgentIterations,
      });
    }
  }, [data, form]);

  const mutation = useMutation(updateAgentBehaviorConfig, {
    onSuccess: (result) => {
      message.success("Agent behavior updated");
      form.setFieldsValue({
        maxAgentIterations: result.maxAgentIterations,
      });
      queryClient.invalidateQueries("agent-behavior-config");
    },
    onError: (error) => {
      message.error(
        error?.response?.data?.message || "Failed to update agent behavior",
      );
    },
  });

  if (isLoading) return <Loader />;

  const min = data?.minMaxAgentIterations ?? 5;
  const max = data?.maxMaxAgentIterations ?? 200;

  return (
    <div className={styles.settingsContainer}>
      <div className={styles.infoBox}>
        <InfoCircleOutlined />
        <span>
          This limit applies to each orchestrator run. When it is reached, the
          session pauses cleanly and lets you continue for another block of
          turns or stop there.
        </span>
      </div>

      <div className={styles.mcpPanel}>
        <div className={styles.mcpPanelHeader}>
          <div>
            <div className={styles.mcpPanelTitle}>Agentic turn limit</div>
            <div className={styles.mcpPanelDescription}>
              Maximum model/tool cycles before Pentest Copilot asks whether to
              continue. Higher values can consume more subscription usage.
            </div>
          </div>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => mutation.mutate(values)}
        >
          <Form.Item
            label="Maximum agentic turns"
            name="maxAgentIterations"
            rules={[
              { required: true, message: "Enter a turn limit" },
              {
                type: "number",
                min,
                max,
                message: `Choose a value from ${min} to ${max}`,
              },
            ]}
          >
            <InputNumber min={min} max={max} step={5} precision={0} />
          </Form.Item>

          <PrimaryButton
            purpleFilled
            htmlType="submit"
            loading={mutation.isLoading}
          >
            Save agent settings
          </PrimaryButton>
        </Form>
      </div>
    </div>
  );
}
