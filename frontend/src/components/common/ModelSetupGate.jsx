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

function hasUsableOrchestrator(data) {
  const models = data?.models || [];
  const orchestratorId = data?.assignments?.orchestratorModelId;
  if (!models.length || !orchestratorId) return false;

  const orchestrator = models.find((model) => model.id === orchestratorId);
  return Boolean(orchestrator?.provider && orchestrator?.model);
}

const ModelSetupGate = ({ children }) => {
  const [settingsOpen, setSettingsOpen] = useState(true);
  const { data, isLoading, isError, refetch } = useQuery(
    "unified-models",
    getModels,
    {
      staleTime: 15 * 1000,
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
        <div className={styles.modelSetupEyebrow}>Setup Required</div>
        <h1>Configure a model before starting</h1>
        <p>
          Add at least one reusable model preset in Settings, then assign the
          orchestrator model. API keys, provider details, racers, and Browser
          Agent model selection all live in Settings &gt; Models.
        </p>

        {isError && (
          <Alert
            type="warning"
            showIcon
            message="Could not load model settings"
            description="Check that the backend is running, then retry."
            className={styles.modelSetupAlert}
          />
        )}

        <div className={styles.modelSetupActions}>
          <PrimaryButton
            purple
            icon={<SettingOutlined />}
            onClick={() => setSettingsOpen(true)}
          >
            Configure Models
          </PrimaryButton>
          {isError && (
            <PrimaryButton onClick={() => refetch()}>Retry</PrimaryButton>
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
