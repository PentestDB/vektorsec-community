"use client";

import { useMemo, useState } from "react";
import { Alert } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import { useQuery } from "react-query";
import Loader from "@/components/common/loader/Loader";
import PrimaryButton from "@/components/common/PrimaryButton";
import SettingsOverlay from "@/components/common/SettingsOverlay";
import { getModels } from "@/services/user.service";
import styles from "@/styles/components/Common.module.scss";
import { useTranslation } from "@/i18n/I18nProvider";

function hasUsableOrchestrator(data) {
  const models = data?.models || [];
  const orchestratorId = data?.assignments?.orchestratorModelId;
  if (!models.length || !orchestratorId) return false;

  const orchestrator = models.find((model) => model.id === orchestratorId);
  return Boolean(orchestrator?.provider && orchestrator?.model);
}

const ModelSetupGate = ({ children }) => {
  const { t } = useTranslation();
  const [settingsOpen, setSettingsOpen] = useState(true);
  const { data, isLoading, isError, refetch } = useQuery(
    "unified-models",
    getModels,
    {
      staleTime: 15 * 1000,
      retryOnMount: false,
    },
  );

  const isConfigured = useMemo(() => hasUsableOrchestrator(data), [data]);

  if (isLoading) {
    return <Loader />;
  }

  if (isConfigured) {
    return children;
  }

  return (
    <div className={styles.modelSetupGate}>
      <div className={styles.modelSetupPanel}>
        <div className={styles.modelSetupEyebrow}>
          {t("modelSetup.eyebrow")}
        </div>
        <h1>{t("modelSetup.title")}</h1>
        <p>{t("modelSetup.body")}</p>

        {isError && (
          <Alert
            type="warning"
            showIcon
            message={t("modelSetup.loadErrorTitle")}
            description={t("modelSetup.loadErrorBody")}
            className={styles.modelSetupAlert}
          />
        )}

        <div className={styles.modelSetupActions}>
          <PrimaryButton
            purple
            icon={<SettingOutlined />}
            onClick={() => setSettingsOpen(true)}
          >
            {t("modelSetup.configure")}
          </PrimaryButton>
          {isError && (
            <PrimaryButton onClick={() => refetch()}>
              {t("common.retry")}
            </PrimaryButton>
          )}
        </div>
      </div>

      <SettingsOverlay
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialTab="models"
      />
    </div>
  );
};

export default ModelSetupGate;
