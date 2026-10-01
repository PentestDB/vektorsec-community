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
import { useTranslation } from "@/i18n/I18nProvider";
import styles from "@/styles/pages/Settings.module.scss";

export default function AgentBehaviorPage() {
  const { t } = useTranslation();
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
      message.success(t("agentBehavior.updated"));
      form.setFieldsValue({
        maxAgentIterations: result.maxAgentIterations,
      });
      queryClient.invalidateQueries("agent-behavior-config");
    },
    onError: (error) => {
      message.error(
        error?.response?.data?.message || t("agentBehavior.updateFailed"),
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
        <span>{t("agentBehavior.info")}</span>
      </div>

      <div className={styles.mcpPanel}>
        <div className={styles.mcpPanelHeader}>
          <div>
            <div className={styles.mcpPanelTitle}>
              {t("agentBehavior.title")}
            </div>
            <div className={styles.mcpPanelDescription}>
              {t("agentBehavior.description")}
            </div>
          </div>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => mutation.mutate(values)}
        >
          <Form.Item
            label={t("agentBehavior.fieldLabel")}
            name="maxAgentIterations"
            rules={[
              { required: true, message: t("agentBehavior.fieldRequired") },
              {
                type: "number",
                min,
                max,
                message: t("agentBehavior.fieldRange", { min, max }),
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
            {t("agentBehavior.submit")}
          </PrimaryButton>
        </Form>
      </div>
    </div>
  );
}
