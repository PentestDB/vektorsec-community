"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button, message, Tooltip } from "antd";
import {
  DisconnectOutlined,
  LinkOutlined,
  SyncOutlined,
  LoadingOutlined,
  TrophyFilled,
  KeyOutlined,
  EditOutlined,
  CheckOutlined,
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
  setFlagFormat,
} from "@/services/ctf.service";
import styles from "@/styles/components/CTF.module.scss";
import { clearContext } from "@/services/agent.service";
import ChallengeTable from "@/components/common/ChallengeTable";
import { PENDING_CTF_SOLVE_KEY, PENDING_SOLVE_READY_EVENT } from "@/constants/ctfUi";

function sanitizeDirName(name) {
  return name
    .replace(/[\/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/\.{2,}/g, "_")
    .replace(/^\.+|\.+$/g, "")
    .substring(0, 200);
}

const CTFPage = ({ sessionId, workspaceId }) => {
  const ctfScopeId = workspaceId || sessionId;
  const queryClient = useQueryClient();
  const router = useRouter();

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
    ["ctf-config", ctfScopeId],
    () => getCtfConfig(ctfScopeId),
    { refetchOnWindowFocus: false, retry: 1 }
  );

  const isConnected = !!config?.connected;

  const {
    data: challengesData,
    isLoading: challengesLoading,
    refetch: refetchChallenges,
  } = useQuery(
    ["ctf-challenges", ctfScopeId],
    () => getCtfChallenges(ctfScopeId),
    { refetchOnWindowFocus: false, retry: 1, refetchInterval: 15_000, enabled: isConnected }
  );

  const challenges = challengesData?.challenges ?? [];
  const activeSolve = challengesData?.activeSolve ?? null;
  const solvedCount = challenges.filter(
    (c) => c.status === "solved" || c.status === "submitted"
  ).length;
  const [editingFlagFormat, setEditingFlagFormat] = useState(false);
  const [flagFormatDraft, setFlagFormatDraft] = useState("");
  const [savingFlagFormat, setSavingFlagFormat] = useState(false);

  const handleEditFlagFormat = () => {
    setFlagFormatDraft(config?.flagFormat || "");
    setEditingFlagFormat(true);
  };

  const handleSaveFlagFormat = async () => {
    setSavingFlagFormat(true);
    try {
      await setFlagFormat(ctfScopeId, flagFormatDraft.trim());
      queryClient.invalidateQueries(["ctf-config", ctfScopeId]);
      setEditingFlagFormat(false);
      message.success("Flag format updated");
    } catch {
      message.error("Failed to update flag format");
    } finally {
      setSavingFlagFormat(false);
    }
  };

  const [showReauth, setShowReauth] = useState(false);
  const [reauthMethod, setReauthMethod] = useState("token");
  const [reauthToken, setReauthToken] = useState("");
  const [reauthUsername, setReauthUsername] = useState("");
  const [reauthPassword, setReauthPassword] = useState("");

  const reauthMutation = useMutation(
    (body) => reauthCtf(ctfScopeId, body),
    {
      onSuccess: (data) => {
        message.success(data.message || "Auth updated");
        setShowReauth(false);
        setReauthToken("");
        setReauthUsername("");
        setReauthPassword("");
        queryClient.invalidateQueries(["ctf-config", ctfScopeId]);
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
  const [solveNavigating, setSolveNavigating] = useState(null);

  const openSolveChallengeModal = useCallback(
    async (ch) => {
      const confirmed = window.confirm(
        [
          "Clear chat and focus this challenge?",
          "",
          "This clears your conversation history for this session.",
          "System prompt and shell sessions stay.",
          "",
          "You will switch to the chat tab and /solve will run for this challenge.",
        ].join("\n")
      );
      if (!confirmed) return;

      setSolveNavigating(ch.name);
      try {
        await clearContext({ sessionId });
        window.dispatchEvent(
          new CustomEvent("context-cleared", { detail: { sessionId } }),
        );
        sessionStorage.setItem(
          PENDING_CTF_SOLVE_KEY,
          JSON.stringify({ sessionId, challengeName: ch.name }),
        );
        message.success("Opening chat…");
        router.push(`/session/${sessionId}`);
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent(PENDING_SOLVE_READY_EVENT));
        }, 100);
      } catch {
        message.error("Failed to clear context");
        sessionStorage.removeItem(PENDING_CTF_SOLVE_KEY);
      } finally {
        setSolveNavigating(null);
      }
    },
    [sessionId, router],
  );

  const handleSubmitFlag = useCallback(async (ch) => {
    setSubmittingFlag(ch.name);
    try {
      const result = await submitFlagToCtfd(ctfScopeId, {
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
      ctfScopeId,
      (event) => {
        if (event.phase === "done") {
          setSyncResult(event);
          setSyncProgress(null);
          setSyncing(false);
          queryClient.invalidateQueries(["ctf-config", ctfScopeId]);
          queryClient.invalidateQueries(["ctf-challenges", ctfScopeId]);
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
    (body) => connectCtf(ctfScopeId, body),
    {
      onSuccess: (data) => {
        message.success(`Connected to ${data.ctfName}`);
        queryClient.invalidateQueries(["ctf-config", ctfScopeId]);
        startSync();
      },
      onError: (err) => {
        const msg = err?.response?.data?.message || "Failed to connect to CTF";
        message.error(msg);
      },
    }
  );

  const disconnectMutation = useMutation(
    () => disconnectCtf(ctfScopeId),
    {
      onSuccess: () => {
        setSyncResult(null);
        setSyncError(null);
        setSyncProgress(null);
        queryClient.invalidateQueries(["ctf-config", ctfScopeId]);
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
          <span className={styles.flagFormatBadge}>
            {editingFlagFormat ? (
              <span className={styles.flagFormatEdit}>
                <input
                  className={styles.flagFormatInput}
                  value={flagFormatDraft}
                  onChange={(e) => setFlagFormatDraft(e.target.value)}
                  placeholder="e.g. CTF{...}"
                  onKeyDown={(e) => e.key === "Enter" && handleSaveFlagFormat()}
                  autoFocus
                />
                <Button
                  type="text"
                  size="small"
                  icon={<CheckOutlined />}
                  loading={savingFlagFormat}
                  onClick={handleSaveFlagFormat}
                  className={styles.flagFormatSaveBtn}
                />
              </span>
            ) : (
              <Tooltip title="Flag format — tells the agent what flags look like. Click to edit.">
                <span
                  className={styles.flagFormatDisplay}
                  onClick={handleEditFlagFormat}
                >
                  <FaFlag style={{ fontSize: "0.55rem" }} />{" "}
                  {config?.flagFormat || "Set flag format"}
                  <EditOutlined className={styles.flagFormatEditIcon} />
                </span>
              </Tooltip>
            )}
          </span>
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
          <ChallengeTable
              challenges={challenges}
              activeSolveName={activeSolve?.name}
              submittingFlag={submittingFlag}
              solveNavigating={solveNavigating}
              onSolve={openSolveChallengeModal}
              onSubmit={handleSubmitFlag}
            />
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
