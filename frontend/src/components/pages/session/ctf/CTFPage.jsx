"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button, message } from "antd";
import { DisconnectOutlined, LinkOutlined, SyncOutlined } from "@ant-design/icons";
import { FaFlag } from "react-icons/fa";
import { useQuery, useMutation, useQueryClient } from "react-query";
import {
  connectCtf,
  getCtfConfig,
  syncCtfStream,
  disconnectCtf,
} from "@/services/ctf.service";
import styles from "@/styles/components/CTF.module.scss";

function sanitizeDirName(name) {
  return name
    .replace(/[\/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/\.{2,}/g, "_")
    .replace(/^\.+|\.+$/g, "")
    .substring(0, 200);
}

const CTFPage = ({ sessionId }) => {
  const queryClient = useQueryClient();

  const [url, setUrl] = useState("");
  const [authMethod, setAuthMethod] = useState("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [apiToken, setApiToken] = useState("");

  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const [syncError, setSyncError] = useState(null);

  const abortRef = useRef(null);
  const logEndRef = useRef(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [syncProgress]);

  const {
    data: config,
    isLoading: configLoading,
  } = useQuery(
    ["ctf-config", sessionId],
    () => getCtfConfig(sessionId),
    { refetchOnWindowFocus: false, retry: 1 }
  );

  const startSync = useCallback(() => {
    setSyncing(true);
    setSyncProgress(null);
    setSyncResult(null);
    setSyncError(null);

    const abort = syncCtfStream(
      sessionId,
      (event) => {
        if (event.phase === "done") {
          setSyncResult(event);
          setSyncProgress(null);
          setSyncing(false);
          queryClient.invalidateQueries(["ctf-config", sessionId]);
          message.success("Sync complete");
        } else if (event.phase === "error") {
          setSyncError(event.detail || "Sync failed");
          setSyncProgress(null);
          setSyncing(false);
          message.error(event.detail || "Sync failed");
        } else {
          setSyncProgress(event);
        }
      },
      () => {
        setSyncing(false);
      },
      (err) => {
        setSyncError(err.message || "Sync failed");
        setSyncProgress(null);
        setSyncing(false);
        message.error(err.message || "Sync failed");
      },
    );

    abortRef.current = abort;
  }, [sessionId, queryClient]);

  const connectMutation = useMutation(
    (body) => connectCtf(sessionId, body),
    {
      onSuccess: (data) => {
        message.success(`Connected to ${data.ctfName}`);
        queryClient.invalidateQueries(["ctf-config", sessionId]);
        startSync();
      },
      onError: (err) => {
        const msg = err?.response?.data?.message || "Failed to connect to CTF";
        message.error(msg);
      },
    }
  );

  const disconnectMutation = useMutation(
    () => disconnectCtf(sessionId),
    {
      onSuccess: () => {
        setSyncResult(null);
        setSyncError(null);
        setSyncProgress(null);
        queryClient.invalidateQueries(["ctf-config", sessionId]);
        message.success("Disconnected from CTF");
      },
      onError: () => {
        message.error("Failed to disconnect");
      },
    }
  );

  const handleConnect = () => {
    if (!url.trim()) {
      message.warning("CTFd URL is required");
      return;
    }
    const body = { url: url.trim() };
    if (authMethod === "credentials") {
      if (!username.trim() || !password.trim()) {
        message.warning("Username and password are required");
        return;
      }
      body.username = username.trim();
      body.password = password.trim();
    } else {
      if (!apiToken.trim()) {
        message.warning("API token is required");
        return;
      }
      body.apiToken = apiToken.trim();
    }
    connectMutation.mutate(body);
  };

  if (configLoading) {
    return (
      <div className={styles.ctfContainer}>
        <div className={styles.emptyState}>
          <div className={styles.spinner} />
          <p>Loading CTF configuration...</p>
        </div>
      </div>
    );
  }

  if (!config?.connected) {
    return (
      <div className={styles.ctfContainer}>
        <div className={styles.emptyState}>
          <FaFlag className={styles.emptyIcon} />
          <h3>CTF Integration</h3>
          <p>
            Connect to a CTFd-based platform to pull challenges into your workspace.
          </p>

          <div className={styles.connectForm}>
            <div className={styles.formGroup}>
              <label>CTFd URL</label>
              <input
                className={styles.formInput}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://ctf.example.com"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Authentication</label>
              <div className={styles.authToggle}>
                <button
                  className={authMethod === "credentials" ? styles.authOptionActive : styles.authOption}
                  onClick={() => setAuthMethod("credentials")}
                >
                  Credentials
                </button>
                <button
                  className={authMethod === "token" ? styles.authOptionActive : styles.authOption}
                  onClick={() => setAuthMethod("token")}
                >
                  API Token
                </button>
              </div>
            </div>

            {authMethod === "credentials" ? (
              <>
                <div className={styles.formGroup}>
                  <label>Username</label>
                  <input
                    className={styles.formInput}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Username"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Password</label>
                  <input
                    className={styles.formInput}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                  />
                </div>
              </>
            ) : (
              <div className={styles.formGroup}>
                <label>API Token</label>
                <input
                  className={styles.formInput}
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder="ctfd_xxxxxxxxxxxxx"
                  onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                />
              </div>
            )}

            <Button
              type="primary"
              icon={<LinkOutlined />}
              loading={connectMutation.isLoading || syncing}
              onClick={handleConnect}
              className={styles.connectBtn}
            >
              {connectMutation.isLoading
                ? "Connecting..."
                : syncing
                  ? "Syncing challenges..."
                  : "Connect & Sync"}
            </Button>

            {syncing && syncProgress && (
              <SyncProgressPanel progress={syncProgress} />
            )}
          </div>
        </div>
      </div>
    );
  }

  const workspacePath = `~/pentest-workspace/${sanitizeDirName(config.ctfName)}`;

  return (
    <div className={styles.ctfContainer}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h2>{config.ctfName}</h2>
          <span className={styles.ctfBadge}>Connected</span>
        </div>
        <div className={styles.headerRight}>
          <Button
            icon={<SyncOutlined spin={syncing} />}
            onClick={startSync}
            disabled={syncing}
            size="small"
            className={styles.refreshBtn}
          >
            {syncing ? "Syncing..." : "Refresh Challenges"}
          </Button>
          <Button
            icon={<DisconnectOutlined />}
            onClick={() => disconnectMutation.mutate()}
            loading={disconnectMutation.isLoading}
            disabled={syncing}
            size="small"
            className={styles.disconnectBtn}
          >
            Disconnect
          </Button>
        </div>
      </div>

      <div className={styles.connectedContent}>
        <div className={styles.infoCard}>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Platform</span>
            <span className={styles.infoValue}>{config.url}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Auth</span>
            <span className={styles.infoValue}>
              {config.authMethod === "credentials" ? "Credentials" : "API Token"}
            </span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Workspace</span>
            <span className={styles.workspacePath}>{workspacePath}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Last Synced</span>
            <span className={styles.infoValue}>
              {config.lastSynced
                ? new Date(config.lastSynced).toLocaleString()
                : "Never"}
            </span>
          </div>
        </div>

        {syncing && syncProgress && (
          <SyncProgressPanel progress={syncProgress} />
        )}

        {!syncing && syncResult && (
          <SyncResultPanel result={syncResult} />
        )}

        {!syncing && syncError && (
          <div className={styles.syncError}>{syncError}</div>
        )}

        <div className={styles.helpText}>
          Challenges are stored as folders on the attack box at{" "}
          <code>{workspacePath}</code>. Each challenge has a{" "}
          <code>challenge.txt</code> with the description and any attached files.
          <br /><br />
          Ask the copilot to <code>ls {workspacePath}</code> to see all challenges,
          or pick a specific one to work on.
        </div>
      </div>
    </div>
  );
};

const SyncProgressPanel = ({ progress }) => {
  const { phase, current, total, name, action } = progress;
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  const phaseLabel = phase === "fetch" ? "Fetching challenges" : "Syncing to workspace";

  const actionIcon =
    action === "new" ? "+" :
    action === "updated" ? "~" :
    action === "skipped" ? "-" : "";

  const actionClass =
    action === "new" ? styles.actionNew :
    action === "updated" ? styles.actionUpdated :
    action === "skipped" ? styles.actionSkipped : "";

  return (
    <div className={styles.progressPanel}>
      <div className={styles.progressHeader}>
        <span className={styles.progressPhase}>{phaseLabel}</span>
        <span className={styles.progressCount}>
          {current}/{total}
        </span>
      </div>
      <div className={styles.progressBarTrack}>
        <div
          className={styles.progressBarFill}
          style={{ width: `${pct}%` }}
        />
      </div>
      {name && (
        <div className={styles.progressCurrent}>
          {actionIcon && (
            <span className={`${styles.progressAction} ${actionClass}`}>
              {actionIcon}
            </span>
          )}
          <span className={styles.progressName}>{name}</span>
        </div>
      )}
    </div>
  );
};

const SyncResultPanel = ({ result }) => {
  const parts = [];
  if (result.synced > 0) parts.push(`${result.synced} new`);
  if (result.updated > 0) parts.push(`${result.updated} updated`);
  if (result.skipped > 0) parts.push(`${result.skipped} unchanged`);

  return (
    <div className={styles.syncSuccess}>
      <span className={styles.resultSummary}>
        {result.total} challenge{result.total !== 1 ? "s" : ""} processed
      </span>
      {parts.length > 0 && (
        <span className={styles.resultBreakdown}>
          {parts.join(" \u00b7 ")}
        </span>
      )}
    </div>
  );
};

export default CTFPage;
