"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button, message, Tooltip } from "antd";
import {
  DisconnectOutlined,
  LinkOutlined,
  SyncOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  SendOutlined,
  LoadingOutlined,
  TrophyFilled,
  KeyOutlined,
} from "@ant-design/icons";
import { FaFlag } from "react-icons/fa";
import { useQuery, useMutation, useQueryClient } from "react-query";
import {
  connectCtf,
  getCtfConfig,
  syncCtfStream,
  disconnectCtf,
  reauthCtf,
  getCtfChallenges,
  submitFlagToCtfd,
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

  const isConnected = !!config?.connected;

  const {
    data: challengesData,
    isLoading: challengesLoading,
    refetch: refetchChallenges,
  } = useQuery(
    ["ctf-challenges", sessionId],
    () => getCtfChallenges(sessionId),
    { refetchOnWindowFocus: false, retry: 1, refetchInterval: 15_000, enabled: isConnected }
  );

  const challenges = challengesData?.challenges ?? [];
  const activeSolve = challengesData?.activeSolve ?? null;
  const solvedCount = challenges.filter(
    (c) => c.status === "solved" || c.status === "submitted"
  ).length;

  const [showReauth, setShowReauth] = useState(false);
  const [reauthMethod, setReauthMethod] = useState("token");
  const [reauthToken, setReauthToken] = useState("");
  const [reauthUsername, setReauthUsername] = useState("");
  const [reauthPassword, setReauthPassword] = useState("");

  const reauthMutation = useMutation(
    (body) => reauthCtf(sessionId, body),
    {
      onSuccess: (data) => {
        message.success(data.message || "Auth updated");
        setShowReauth(false);
        setReauthToken("");
        setReauthUsername("");
        setReauthPassword("");
        queryClient.invalidateQueries(["ctf-config", sessionId]);
      },
      onError: (err) => {
        message.error(err?.response?.data?.message || "Re-authentication failed");
      },
    }
  );

  const handleReauth = () => {
    if (reauthMethod === "token") {
      if (!reauthToken.trim()) {
        message.warning("API token is required");
        return;
      }
      reauthMutation.mutate({ apiToken: reauthToken.trim() });
    } else {
      if (!reauthUsername.trim() || !reauthPassword.trim()) {
        message.warning("Username and password are required");
        return;
      }
      reauthMutation.mutate({ username: reauthUsername.trim(), password: reauthPassword.trim() });
    }
  };

  const [submittingFlag, setSubmittingFlag] = useState(null);

  const handleSubmitFlag = useCallback(async (ch) => {
    setSubmittingFlag(ch.name);
    try {
      const result = await submitFlagToCtfd(sessionId, {
        challengeName: ch.name,
        challengeId: ch.id,
        flag: ch.flag,
      });
      if (result.success) {
        message.success(`Flag accepted for ${ch.name}!`);
      } else {
        message.error(result.message || `Flag rejected for ${ch.name}`);
      }
      refetchChallenges();
    } catch (err) {
      message.error(err?.response?.data?.message || "Failed to submit flag");
    } finally {
      setSubmittingFlag(null);
    }
  }, [sessionId, refetchChallenges]);

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
          queryClient.invalidateQueries(["ctf-challenges", sessionId]);
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

  return (
    <div className={styles.ctfContainer}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h2>{config.ctfName}</h2>
          <span className={styles.ctfBadge}>Connected</span>
          {challenges.length > 0 && (
            <span className={styles.scoreBadge}>
              <TrophyFilled /> {solvedCount}/{challenges.length}
            </span>
          )}
        </div>
        <div className={styles.headerRight}>
          <Button
            icon={<SyncOutlined spin={syncing} />}
            onClick={startSync}
            disabled={syncing}
            size="small"
            className={styles.refreshBtn}
          >
            {syncing ? "Syncing..." : "Refresh"}
          </Button>
          <Tooltip title="Update CTFd credentials (use API token for reliable flag submission)">
            <Button
              icon={<KeyOutlined />}
              onClick={() => setShowReauth((v) => !v)}
              size="small"
              className={showReauth ? styles.reauthBtnActive : styles.reauthBtn}
            >
              Re-auth
            </Button>
          </Tooltip>
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

      {showReauth && (
        <div className={styles.reauthPanel}>
          <div className={styles.reauthForm}>
            <div className={styles.formGroup}>
              <label>Authentication Method</label>
              <div className={styles.authToggle}>
                <button
                  className={reauthMethod === "token" ? styles.authOptionActive : styles.authOption}
                  onClick={() => setReauthMethod("token")}
                >
                  API Token
                </button>
                <button
                  className={reauthMethod === "credentials" ? styles.authOptionActive : styles.authOption}
                  onClick={() => setReauthMethod("credentials")}
                >
                  Credentials
                </button>
              </div>
            </div>

            {reauthMethod === "token" ? (
              <div className={styles.formGroup}>
                <label>Access Token</label>
                <input
                  className={styles.formInput}
                  value={reauthToken}
                  onChange={(e) => setReauthToken(e.target.value)}
                  placeholder="ctfd_xxxxxxxxxxxxx"
                  onKeyDown={(e) => e.key === "Enter" && handleReauth()}
                />
                <span className={styles.reauthHint}>
                  Generate from CTFd → Settings → Access Tokens. Preferred for reliable flag submission.
                </span>
              </div>
            ) : (
              <>
                <div className={styles.formGroup}>
                  <label>Username</label>
                  <input
                    className={styles.formInput}
                    value={reauthUsername}
                    onChange={(e) => setReauthUsername(e.target.value)}
                    placeholder="Username"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Password</label>
                  <input
                    className={styles.formInput}
                    type="password"
                    value={reauthPassword}
                    onChange={(e) => setReauthPassword(e.target.value)}
                    placeholder="Password"
                    onKeyDown={(e) => e.key === "Enter" && handleReauth()}
                  />
                </div>
              </>
            )}

            <div className={styles.reauthActions}>
              <Button
                type="primary"
                icon={<KeyOutlined />}
                loading={reauthMutation.isLoading}
                onClick={handleReauth}
                size="small"
              >
                Update Auth
              </Button>
              <Button
                size="small"
                onClick={() => setShowReauth(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.connectedContent}>
        {syncing && syncProgress && (
          <SyncProgressPanel progress={syncProgress} />
        )}

        {!syncing && syncResult && (
          <SyncResultPanel result={syncResult} />
        )}

        {!syncing && syncError && (
          <div className={styles.syncError}>{syncError}</div>
        )}

        {challengesLoading ? (
          <div className={styles.challengeListLoading}>
            <LoadingOutlined /> Loading challenges...
          </div>
        ) : challenges.length > 0 ? (
          <div className={styles.challengeTable}>
            <div className={styles.tableHeader}>
              <span className={styles.colName}>Challenge</span>
              <span className={styles.colCategory}>Category</span>
              <span className={styles.colPoints}>Pts</span>
              <span className={styles.colStatus}>Status</span>
              <span className={styles.colFlag}>Flag</span>
              <span className={styles.colAction}></span>
            </div>
            {challenges.map((ch) => (
              <ChallengeRow
                key={ch.safeDir}
                challenge={ch}
                isActive={activeSolve?.name === ch.name}
                submitting={submittingFlag === ch.name}
                onSubmit={() => handleSubmitFlag(ch)}
              />
            ))}
          </div>
        ) : (
          <div className={styles.helpText}>
            No challenges synced yet. Click <strong>Refresh</strong> to sync
            challenges from CTFd, or they will appear after the first sync.
          </div>
        )}
      </div>
    </div>
  );
};

const StatusBadge = ({ status, submittedToCtfd }) => {
  if (submittedToCtfd || status === "submitted") {
    return (
      <span className={`${styles.statusBadge} ${styles.statusSubmitted}`}>
        <CheckCircleFilled /> Submitted
      </span>
    );
  }
  if (status === "solved") {
    return (
      <span className={`${styles.statusBadge} ${styles.statusSolved}`}>
        <FaFlag style={{ fontSize: "0.6rem" }} /> Solved
      </span>
    );
  }
  if (status === "solving") {
    return (
      <span className={`${styles.statusBadge} ${styles.statusSolving}`}>
        <ClockCircleOutlined /> Solving
      </span>
    );
  }
  return (
    <span className={`${styles.statusBadge} ${styles.statusPending}`}>
      Pending
    </span>
  );
};

const ChallengeRow = ({ challenge: ch, isActive, submitting, onSubmit }) => {
  return (
    <div
      className={`${styles.tableRow} ${isActive ? styles.tableRowActive : ""}`}
    >
      <span className={styles.colName}>
        <span className={styles.challengeName}>{ch.name}</span>
      </span>
      <span className={styles.colCategory}>
        <span className={styles.categoryTag}>{ch.category}</span>
      </span>
      <span className={styles.colPoints}>{ch.value}</span>
      <span className={styles.colStatus}>
        <StatusBadge status={ch.status} submittedToCtfd={ch.submittedToCtfd} />
      </span>
      <span className={styles.colFlag}>
        {ch.flag ? (
          <Tooltip title={ch.flag}>
            <code className={styles.flagValue}>{ch.flag}</code>
          </Tooltip>
        ) : (
          <span className={styles.noFlag}>—</span>
        )}
      </span>
      <span className={styles.colAction}>
        {ch.flag && (ch.status === "solved" || ch.status === "submitted" || ch.submittedToCtfd) && (
          <Button
            size="small"
            type={ch.submittedToCtfd ? "default" : "primary"}
            icon={submitting ? <LoadingOutlined /> : <SendOutlined />}
            loading={submitting}
            onClick={onSubmit}
            className={ch.submittedToCtfd ? styles.resubmitBtn : styles.submitBtn}
          >
            {ch.submittedToCtfd ? "Re-submit" : "Submit"}
          </Button>
        )}
      </span>
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
