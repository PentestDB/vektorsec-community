"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Input, Select, Spin } from "antd";
import {
  CheckCircleFilled,
  CloudServerOutlined,
  DesktopOutlined,
  FolderOpenOutlined,
  LaptopOutlined,
  ReloadOutlined,
  SaveOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { useRouter } from "next/navigation";
import { getSessionInfo } from "@/services/agent.service";
import {
  getWorkspaceWorkHost,
  testWorkspaceWorkHost,
  updateWorkspaceWorkHost,
} from "@/services/workspace.service";
import GUISettingsPage from "@/components/pages/settings/GUISettings";
import DirectoryPickerModal from "./DirectoryPickerModal";
import styles from "@/styles/pages/Connection.module.scss";

const EMPTY_HOST = { kind: "local", workFolder: "", sshProfileAlias: "" };

function toDraft(workHost) {
  return {
    kind: workHost?.kind === "ssh" ? "ssh" : "local",
    workFolder: workHost?.workFolder || "",
    sshProfileAlias: workHost?.sshProfileAlias || "",
  };
}

export default function WorkspaceConnectionPage({ sessionId }) {
  const { message } = App.useApp();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(EMPTY_HOST);
  const [showDesktopSetup, setShowDesktopSetup] = useState(false);
  const [showDirectoryPicker, setShowDirectoryPicker] = useState(false);

  const { data: sessionInfo, isLoading: sessionLoading } = useQuery(
    ["session-info", sessionId],
    () => getSessionInfo(sessionId),
    { enabled: Boolean(sessionId) },
  );
  const workspaceId = sessionInfo?.workspaceId;
  const queryKey = ["workspace-work-host", workspaceId];
  const {
    data,
    isLoading: hostLoading,
    isFetching,
    refetch,
    error: hostError,
  } = useQuery(queryKey, () => getWorkspaceWorkHost(workspaceId), {
    enabled: Boolean(workspaceId),
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (data?.workHost) setDraft(toDraft(data.workHost));
  }, [data?.workHost]);

  const profiles = data?.profiles ?? [];
  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.alias === draft.sshProfileAlias),
    [profiles, draft.sshProfileAlias],
  );
  const saved = toDraft(data?.workHost);
  const isDirty =
    saved.kind !== draft.kind ||
    saved.workFolder !== draft.workFolder.trim() ||
    (draft.kind === "ssh" && saved.sshProfileAlias !== draft.sshProfileAlias);
  const valid = Boolean(
    draft.workFolder.trim() &&
    (draft.kind === "local" || selectedProfile?.available),
  );
  const requestHost = {
    kind: draft.kind,
    workFolder: draft.workFolder.trim(),
    ...(draft.kind === "ssh" ? { sshProfileAlias: draft.sshProfileAlias } : {}),
  };

  const testMutation = useMutation(testWorkspaceWorkHost, {
    onSuccess: (result) => {
      if (result.success) {
        message.success(`Ready to work in ${result.workFolder || draft.workFolder}`);
      } else {
        message.error(result.message || "Could not use this workspace location");
      }
    },
    onError: (error) =>
      message.error(error?.response?.data?.message || "Could not test this workspace location"),
  });

  const saveMutation = useMutation(updateWorkspaceWorkHost, {
    onSuccess: async (result) => {
      message.success(result.message || "Workspace location saved");
      queryClient.setQueryData(queryKey, (current) => ({
        ...(current || {}),
        workHost: result.workHost,
      }));
      await Promise.all([
        queryClient.invalidateQueries(queryKey),
        queryClient.invalidateQueries(["session-info", sessionId]),
        queryClient.invalidateQueries(["connection-status", sessionId]),
      ]);
    },
    onError: (error) =>
      message.error(error?.response?.data?.message || "Could not save the workspace location"),
  });

  if (sessionLoading || (workspaceId && hostLoading)) {
    return <div className={styles.center}><Spin /></div>;
  }

  if (!workspaceId) {
    return (
      <div className={styles.page}>
        <Alert
          type="warning"
          showIcon
          message="This session is not attached to a workspace"
          description="Create or open a workspace first so its host and work folder can be shared by every session in it."
        />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Workspace location</span>
          <h1>Connection</h1>
          <p>Choose one host and folder. Terminals, tools, VPN, GUI, and AI runs all work from here.</p>
        </div>
        <div className={`${styles.status} ${data?.workHost ? styles.connected : styles.disconnected}`}>
          {data?.workHost && <CheckCircleFilled />}
          {data?.workHost ? "Workspace ready" : "Setup required"}
        </div>
      </header>

      {hostError && (
        <Alert
          className={styles.alert}
          type="error"
          showIcon
          message="Could not load the workspace location"
          description={hostError?.response?.data?.message || "Check that the backend is running, then retry."}
          action={<Button icon={<ReloadOutlined />} loading={isFetching} onClick={() => refetch()}>Retry</Button>}
        />
      )}

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2>Where should this workspace run?</h2>
            <p>This choice applies to every session in the workspace.</p>
          </div>
        </div>

        <div className={styles.hostGrid} role="radiogroup" aria-label="Work host">
          <button
            type="button"
            role="radio"
            aria-checked={draft.kind === "local"}
            className={`${styles.hostChoice} ${draft.kind === "local" ? styles.hostChoiceSelected : ""}`}
            onClick={() => setDraft((current) => ({ ...current, kind: "local", sshProfileAlias: "" }))}
          >
            <LaptopOutlined />
            <span><strong>Local</strong><small>Run on the same host as Pentest Copilot</small></span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={draft.kind === "ssh"}
            className={`${styles.hostChoice} ${draft.kind === "ssh" ? styles.hostChoiceSelected : ""}`}
            onClick={() => setDraft((current) => ({ ...current, kind: "ssh" }))}
          >
            <CloudServerOutlined />
            <span><strong>Remote host</strong><small>Connect using a profile from your SSH config</small></span>
          </button>
        </div>

        {draft.kind === "ssh" && (
          <div className={styles.field}>
            <label htmlFor="work-host-profile">SSH host</label>
            <Select
              id="work-host-profile"
              value={draft.sshProfileAlias || undefined}
              placeholder="Choose a host"
              onChange={(sshProfileAlias) => setDraft((current) => ({ ...current, sshProfileAlias }))}
              options={profiles.map((profile) => ({
                value: profile.alias,
                disabled: !profile.available,
                label: profile.available
                  ? `${profile.label} — ${profile.username}@${profile.host}:${profile.port}`
                  : `${profile.label} — unavailable`,
              }))}
              notFoundContent="No SSH hosts found in the mounted SSH config"
              className={styles.select}
              popupClassName={styles.selectPopup}
            />
            {selectedProfile?.error && <small className={styles.fieldError}>{selectedProfile.error}</small>}
            <small>Keys and passwords stay in your SSH config or agent; Pentest Copilot stores only the profile name.</small>
          </div>
        )}

        <div className={styles.field}>
          <label htmlFor="workspace-folder"><FolderOpenOutlined /> Work folder</label>
          <div className={styles.folderInputRow}>
            <Input
              id="workspace-folder"
              value={draft.workFolder}
              placeholder="~/pentest-workspaces/my-project"
              onChange={(event) => setDraft((current) => ({ ...current, workFolder: event.target.value }))}
              onPressEnter={() => valid && saveMutation.mutate({ workspaceId, workHost: requestHost })}
            />
            <Button
              icon={<FolderOpenOutlined />}
              disabled={draft.kind === "ssh" && !selectedProfile?.available}
              onClick={() => setShowDirectoryPicker(true)}
            >
              Browse
            </Button>
          </div>
          <small>The folder is created automatically on the selected host. All workspace commands start inside it.</small>
        </div>

        <div className={styles.actions}>
          <Button
            icon={<ThunderboltOutlined />}
            disabled={!valid}
            loading={testMutation.isLoading}
            onClick={() => testMutation.mutate({ workspaceId, workHost: requestHost })}
          >
            Test location
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            disabled={!valid || !isDirty}
            loading={saveMutation.isLoading}
            onClick={() => saveMutation.mutate({ workspaceId, workHost: requestHost })}
          >
            Save workspace location
          </Button>
        </div>
      </section>

      <section className={styles.summary}>
        <div><span>Host</span><strong>{draft.kind === "local" ? "Local" : selectedProfile?.label || "Not selected"}</strong></div>
        <div><span>Work folder</span><strong>{draft.workFolder || "Not selected"}</strong></div>
        <div><span>Used by</span><strong>Shells · Tools · VPN · GUI · Agents</strong></div>
      </section>

      <section className={styles.card}>
        <div className={styles.desktopHeader}>
          <div className={styles.desktopIntro}>
            <DesktopOutlined />
            <div><h2>GUI desktop</h2><p>Set up or manage the graphical desktop on this workspace host.</p></div>
          </div>
          <div className={styles.desktopActions}>
            <Button onClick={() => setShowDesktopSetup((visible) => !visible)}>
              {showDesktopSetup ? "Hide setup" : "Configure"}
            </Button>
            <Button type="primary" onClick={() => router.push(`/session/${sessionId}/gui`)}>Open desktop</Button>
          </div>
        </div>
        {showDesktopSetup && (
          <div className={styles.desktopSetup}>
            <GUISettingsPage sessionId={sessionId} />
          </div>
        )}
      </section>

      <DirectoryPickerModal
        open={showDirectoryPicker}
        workspaceId={workspaceId}
        workHost={requestHost}
        selectedPath={draft.workFolder}
        onCancel={() => setShowDirectoryPicker(false)}
        onSelect={(workFolder) => {
          setDraft((current) => ({ ...current, workFolder }));
          setShowDirectoryPicker(false);
        }}
      />
    </div>
  );
}
