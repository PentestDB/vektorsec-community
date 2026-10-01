import styles from "@/styles/pages/WorkspaceDetail.module.scss";
import { message, Tag, Tooltip, Input, Form, Radio, Empty, Button, Spin, Select, Switch, Popover } from "antd";
import PrimaryButton from "@/components/common/PrimaryButton";
import {
  PlusOutlined,
  ArrowLeftOutlined,
  SyncOutlined,
  LinkOutlined,
  DisconnectOutlined,
  PlayCircleOutlined,
  TrophyFilled,
  ClockCircleOutlined,
  LoadingOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import Loader from "@/components/common/loader/Loader";
import { useSelector } from "react-redux";
import { useQuery, useMutation, useQueryClient } from "react-query";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { getWorkspaceDetail, createSessionInWorkspace, updateWorkspaceAgentConfig } from "@/services/workspace.service";
import { getCtfChallenges, connectCtf, syncCtfStream, disconnectCtf, submitFlagToCtfd, startSolvingAll } from "@/services/ctf.service";
import { deleteSession } from "@/services/agent.service";
import { formatDurationSec } from "@/utils/formatDuration";
import moment from "moment";
import { useRouter } from "next/navigation";
import { FiTrash, FiFlag, FiKey, FiLock } from "react-icons/fi";
import ModalComponent from "@/components/common/ModalComponent";
import { useConfirmPopUp } from "@/components/common/ConfirmPopUp";
import ChallengeTable from "@/components/common/ChallengeTable";

const STATE_DOT = {
  running: { color: "#00e676", label: "Running" },
  idle: { color: "#00f2fe", label: "Idle" },
  paused: { color: "#38bdf8", label: "Paused" },
  waiting_consent: { color: "#38bdf8", label: "Waiting" },
  waiting_manual_execution: { color: "#38bdf8", label: "Waiting" },
};

const WorkspaceDetailPage = ({ workspaceId }) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useSelector((state) => state.user);
  const confirmPopUp = useConfirmPopUp();

  const [showNewSession, setShowNewSession] = useState(false);
  const [showCtfConnect, setShowCtfConnect] = useState(false);
  const [ctfAuthMethod, setCtfAuthMethod] = useState("token");
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");
  const [syncProgress, setSyncProgress] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const [syncError, setSyncError] = useState(null);
  const syncAbortRef = useRef(null);
  const [newSessionForm] = Form.useForm();

  const { data: workspace, isLoading } = useQuery(
    ["workspace-detail", workspaceId],
    () => getWorkspaceDetail(workspaceId),
    { enabled: !!user && !!workspaceId, refetchInterval: 8000 }
  );

  const { data: challengesData, isLoading: challengesLoading } = useQuery(
    ["ctf-challenges", workspaceId],
    () => getCtfChallenges(workspaceId),
    {
      enabled: !!workspace?.ctf?.connected,
      refetchInterval: 15000,
    }
  );

  const createSessionMutation = useMutation(
    (values) => createSessionInWorkspace({ workspaceId, ...values }),
    {
      onSuccess: (data) => {
        message.success("Session created!");
        queryClient.invalidateQueries(["workspace-detail", workspaceId]);
        setShowNewSession(false);
        newSessionForm.resetFields();
        router.push(`/session/${data.sessionId}`);
      },
      onError: (err) => {
        message.error(err?.response?.data?.message ?? "Failed to create session");
      },
    }
  );

  const deleteSessionMutation = useMutation(deleteSession, {
    onSuccess: () => {
      message.success("Session deleted");
      queryClient.invalidateQueries(["workspace-detail", workspaceId]);
    },
    onError: (err) => {
      message.error(err?.response?.data?.message ?? "Failed to delete session");
    },
  });

  const onDeleteSession = (sessionId, e) => {
    e?.stopPropagation?.();
    confirmPopUp({
      title: "Delete session?",
      content: "This session will be archived.",
      okText: "Delete",
      cancelText: "Cancel",
      onOk: async () => {
        await deleteSessionMutation.mutateAsync({ sessionId });
      },
    });
  };

  const handleCtfConnect = async (values) => {
    try {
      setSyncing(true);
      setSyncStatus("Connecting...");

      const body =
        ctfAuthMethod === "token"
          ? { url: values.ctfUrl, apiToken: values.apiToken }
          : { url: values.ctfUrl, username: values.username, password: values.password };

      const connectResult = await connectCtf(workspaceId, body);

      const refresh = () => {
        queryClient.invalidateQueries(["workspace-detail", workspaceId]);
        queryClient.invalidateQueries(["ctf-challenges", workspaceId]);
        setShowCtfConnect(false);
        setSyncStatus("");
      };

      // Connected, but CTFd is withholding challenges (not started / no team).
      // Keep the connection and let the user sync when the event opens.
      if (connectResult?.challengesAvailable === false) {
        refresh();
        message.info(
          connectResult.unavailableReason ||
            "Connected, but challenges aren't available yet. Use Sync Challenges once the CTF starts.",
          8,
        );
        return;
      }

      setSyncStatus("Connected! Syncing challenges...");

      await new Promise((resolve, reject) => {
        syncCtfStream(
          workspaceId,
          (event) => {
            if (event.phase === "done") {
              setSyncStatus(`Synced ${event.total} challenges`);
            } else if (event.phase === "error") {
              reject(new Error(event.detail));
            } else if (event.phase === "sync") {
              setSyncStatus(`Syncing: ${event.name || ""} (${event.current}/${event.total})`);
            }
          },
          resolve,
          reject,
        );
      });

      queryClient.invalidateQueries(["workspace-detail", workspaceId]);
      queryClient.invalidateQueries(["ctf-challenges", workspaceId]);
      message.success("CTF connected and synced!");
      setShowCtfConnect(false);
      setSyncStatus("");
    } catch (err) {
      message.error(
        err?.response?.data?.message || err?.message || "Failed to connect CTF",
        8,
      );
      setSyncStatus("");
    } finally {
      setSyncing(false);
    }
  };

  const handleSync = useCallback(() => {
    setSyncing(true);
    setSyncProgress(null);
    setSyncResult(null);
    setSyncError(null);

    const abort = syncCtfStream(
      workspaceId,
      (event) => {
        if (event.phase === "done") {
          setSyncResult(event);
          setSyncProgress(null);
          setSyncing(false);
          queryClient.invalidateQueries(["workspace-detail", workspaceId]);
          queryClient.invalidateQueries(["ctf-challenges", workspaceId]);
          message.success("Challenges synced!");
        } else if (event.phase === "error") {
          setSyncError(event.detail || "Sync failed");
          setSyncProgress(null);
          setSyncing(false);
          message.error(event.detail || "Sync failed");
        } else {
          setSyncProgress(event);
        }
      },
      () => { setSyncing(false); },
      (err) => {
        setSyncError(err?.message || "Sync failed");
        setSyncProgress(null);
        setSyncing(false);
        message.error(err?.message || "Sync failed");
      },
    );

    syncAbortRef.current = abort;
  }, [workspaceId, queryClient]);

  const [submittingFlag, setSubmittingFlag] = useState(null);
  const [solvingAll, setSolvingAll] = useState(false);

  const challenges = challengesData?.challenges || [];
  const activeSolve = challengesData?.activeSolve ?? null;
  const isCTF = workspace?.type === "ctf";
  const ctfConnected = workspace?.ctf?.connected;
  const sessions = workspace?.sessions || [];

  const activeSessions = sessions.filter((s) => s.agentState === "running").length;
  const idleSessions = sessions.filter((s) => s.agentState === "idle").length;
  const tokensUsed = sessions.reduce((sum, s) => sum + (s.totalTokens || 0), 0);
  const ctfMeta = workspace?.ctf;
  const targetInfo = isCTF && ctfMeta?.ctfName
    ? ctfMeta.ctfName
    : isCTF && ctfMeta?.url
    ? (() => {
        try {
          return new URL(ctfMeta.url).hostname;
        } catch {
          return ctfMeta.url;
        }
      })()
    : "Not configured";

  const solvedCount = challenges.filter(
    (c) => c.status === "solved" || c.status === "submitted",
  ).length;

  const solvedWithTime = challenges.filter(
    (c) => (c.status === "solved" || c.status === "submitted") && c.timeToSolveSec != null,
  );
  const totalSolveTimeSec = solvedWithTime.reduce((acc, c) => acc + c.timeToSolveSec, 0);
  const avgSolveTimeSec =
    solvedWithTime.length > 0 ? Math.round(totalSolveTimeSec / solvedWithTime.length) : null;

  const sessionsByName = useMemo(() => {
    const map = {};
    sessions.forEach((s) => { map[s.name] = s; });
    return map;
  }, [sessions]);

  // Challenges that "Solve All" would actually start: not yet solved, and
  // backed by a session (sessions are matched to challenges by name).
  const solvableChallenges = useMemo(
    () =>
      challenges.filter(
        (c) => c.status !== "solved" && c.status !== "submitted" && sessionsByName[c.name],
      ),
    [challenges, sessionsByName],
  );

  const handleSolveAll = useCallback(() => {
    const count = solvableChallenges.length;
    confirmPopUp({
      title: `Start solving ${count} challenge${count === 1 ? "" : "s"}?`,
      content:
        `Each unsolved challenge with a session will start its own agent, all at once. ` +
        `Challenges already solved or currently running are skipped.`,
      okText: "Start All",
      cancelText: "Cancel",
      okButtonBg: "#7c3aed",
      onOk: async () => {
        setSolvingAll(true);
        try {
          const res = await startSolvingAll(workspaceId);
          message.success(res?.message || `Started ${res?.started ?? 0} sessions`);
          queryClient.invalidateQueries(["workspace-detail", workspaceId]);
          queryClient.invalidateQueries(["ctf-challenges", workspaceId]);
        } catch (err) {
          message.error(err?.response?.data?.message || "Failed to start solving");
        } finally {
          setSolvingAll(false);
        }
      },
    });
  }, [solvableChallenges.length, confirmPopUp, workspaceId, queryClient]);

  const handleDisconnect = async () => {
    try {
      await disconnectCtf(workspaceId);
      queryClient.invalidateQueries(["workspace-detail", workspaceId]);
      message.success("Disconnected from CTF");
    } catch {
      message.error("Failed to disconnect");
    }
  };

  const handleSubmitFlag = useCallback(async (ch) => {
    if (!ch.flag || submittingFlag) return;
    setSubmittingFlag(ch.name);
    try {
      const res = await submitFlagToCtfd(workspaceId, {
        challengeName: ch.name,
        flag: ch.flag,
      });
      message.success(res?.message || "Flag submitted!");
      queryClient.invalidateQueries(["ctf-challenges", workspaceId]);
    } catch (err) {
      message.error(err?.response?.data?.message || "Submission failed");
    } finally {
      setSubmittingFlag(null);
    }
  }, [workspaceId, submittingFlag, queryClient]);

  const handleChallengeRowClick = useCallback(
    (ch) => {
      const session = sessionsByName[ch.name];
      if (session) router.push(`/session/${session.sessionId}`);
    },
    [sessionsByName, router],
  );

  const handleChallengeSolve = useCallback(
    (ch) => {
      const session = sessionsByName[ch.name];
      if (session) router.push(`/session/${session.sessionId}`);
    },
    [sessionsByName, router],
  );

  const renderChallengeExtraActions = useCallback(
    (ch) => {
      const session = sessionsByName[ch.name];
      if (!session) return null;
      return (
        <Tooltip title="Delete session">
          <div
            className={styles.sessionActionBtn}
            onClick={(e) => onDeleteSession(session.sessionId, e)}
          >
            <FiTrash size={11} />
          </div>
        </Tooltip>
      );
    },
    [sessionsByName, onDeleteSession],
  );

  // ── Agent turn limit (Workspace Settings → Agent Max Turns) ─────────────
  const defaultAgentTurns = workspace?.defaultAgentMaxTurns ?? 25;
  const turnChoices = workspace?.agentTurnLimitChoices?.length
    ? workspace.agentTurnLimitChoices
    : [25, 50, 100];
  const effectiveTurnLimit = turnChoices.includes(workspace?.agentConfig?.maxTurns)
    ? workspace.agentConfig.maxTurns
    : defaultAgentTurns;
  const [turnLimit, setTurnLimit] = useState(effectiveTurnLimit);

  // ── Workspace guardrails: Autonomous Mode + Target Scope allowlist ─────
  const initialScope = workspace?.agentConfig?.scope ?? {};
  const [autonomousMode, setAutonomousMode] = useState(
    workspace?.agentConfig?.autonomousMode === true,
  );
  const [scopeEnabled, setScopeEnabled] = useState(initialScope?.enabled === true);
  const [scopeStrict, setScopeStrict] = useState(initialScope?.strictMode === true);
  const [scopeEntries, setScopeEntries] = useState(initialScope?.entriesRaw ?? "");

  useEffect(() => {
    setTurnLimit(effectiveTurnLimit);
    setAutonomousMode(workspace?.agentConfig?.autonomousMode === true);
    const s = workspace?.agentConfig?.scope ?? {};
    setScopeEnabled(s?.enabled === true);
    setScopeStrict(s?.strictMode === true);
    setScopeEntries(s?.entriesRaw ?? "");
  }, [effectiveTurnLimit, workspace]);

  const updateTurns = useMutation(
    (value) => updateWorkspaceAgentConfig({ workspaceId, maxTurns: value }),
    {
      onSuccess: (data) => {
        setTurnLimit(data?.maxTurns ?? defaultAgentTurns);
        message.success("Workspace agent settings updated");
        queryClient.invalidateQueries(["workspace-detail", workspaceId]);
      },
      onError: (error) => {
        message.error(
          error?.response?.data?.message || "Failed to update workspace agent settings",
        );
      },
    },
  );

  const saveGuardrails = useMutation(
    () =>
      updateWorkspaceAgentConfig({
        workspaceId,
        maxTurns: turnLimit,
        autonomousMode,
        scope: {
          enabled: scopeEnabled,
          strictMode: scopeStrict,
          entriesRaw: scopeEntries,
        },
      }),
    {
      onSuccess: (data) => {
        setTurnLimit(data?.maxTurns ?? defaultAgentTurns);
        setAutonomousMode(data?.autonomousMode === true);
        const s = data?.scope ?? {};
        setScopeEnabled(s?.enabled === true);
        setScopeStrict(s?.strictMode === true);
        setScopeEntries(s?.entriesRaw ?? "");
        message.success("Workspace guardrails updated");
        queryClient.invalidateQueries(["workspace-detail", workspaceId]);
      },
      onError: (error) => {
        message.error(
          error?.response?.data?.message || "Failed to update workspace guardrails",
        );
      },
    },
  );

  const guardrailsPopoverContent = (
    <div style={{ width: 340 }}>
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 4,
          }}
        >
          <span style={{ fontWeight: 600 }}>Autonomous Mode</span>
          <Switch size="small" checked={autonomousMode} onChange={setAutonomousMode} />
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>
          Agent runs high-risk in-scope actions (WAF bypass, origin-IP scan, active
          recon) immediately without pausing for confirmation. Destructive or
          out-of-scope actions are still blocked.
        </div>
      </div>
      <div style={{ borderTop: "1px solid #1e293b", paddingTop: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Target Scope (Whitelist)</div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "#94a3b8", display: "inline-flex", alignItems: "center", gap: 6 }}>
            Enable allowlist
            <Switch size="small" checked={scopeEnabled} onChange={setScopeEnabled} />
          </span>
          <span style={{ fontSize: 12, color: "#94a3b8", display: "inline-flex", alignItems: "center", gap: 6 }}>
            Strict (block)
            <Switch size="small" checked={scopeStrict} onChange={setScopeStrict} disabled={!scopeEnabled} />
          </span>
        </div>
        <Input.TextArea
          rows={4}
          value={scopeEntries}
          onChange={(e) => setScopeEntries(e.target.value)}
          disabled={!scopeEnabled}
          placeholder={"example.com\n*.corp.test\n10.10.0.0/16\n203.0.113.10"}
          style={{ fontSize: 12 }}
        />
        <div style={{ fontSize: 11, color: "#64748b", margin: "4px 0 10px", lineHeight: 1.5 }}>
          One per line: domain (covers subdomains), *.domain, IP or CIDR. The agent
          skips tools targeting anything outside this list.
        </div>
        <Button
          type="primary"
          size="small"
          loading={saveGuardrails.isLoading}
          onClick={() => saveGuardrails.mutate()}
          style={{ background: "#7c3aed", borderColor: "#7c3aed" }}
        >
          Save guardrails
        </Button>
      </div>
    </div>
  );

  if (!user || isLoading || !workspace) {
    return <Loader />;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button
            className={styles.backBtn}
            onClick={() => router.push("/dashboard")}
          >
            <ArrowLeftOutlined /> Back
          </button>
          <div className={styles.headerInfo}>
            <div className={styles.titleRow}>
              <h1>{workspace.name}</h1>
              <Tag className={styles.typeBadge} color={
                workspace.type === "ctf" ? "#00f2fe" :
                workspace.type === "pentest" ? "#00e676" : "#7dd3fc"
              }>
                {workspace.type?.toUpperCase()}
              </Tag>
              {isCTF && ctfConnected && challenges.length > 0 && (
                <span className={styles.scoreBadge}>
                  <TrophyFilled /> {solvedCount}/{challenges.length}
                </span>
              )}
              {isCTF && ctfConnected && solvedWithTime.length > 0 && (
                <span className={styles.statBadge}>
                  <ClockCircleOutlined /> {formatDurationSec(totalSolveTimeSec)} total
                </span>
              )}
              {isCTF && ctfConnected && avgSolveTimeSec != null && (
                <span className={styles.statBadge}>
                  ⌀ {formatDurationSec(avgSolveTimeSec)} / challenge
                </span>
              )}
            </div>
            {isCTF && ctfConnected ? (
              <p className={styles.ctfSubtitle}>
                <FiFlag size={11} />
                {workspace.ctf.ctfName && <span className={styles.ctfSubtitleName}>{workspace.ctf.ctfName}</span>}
                {workspace.ctf.url && <span className={styles.ctfSubtitleUrl}>{workspace.ctf.url}</span>}
                {workspace.ctf.flagFormat && <code className={styles.flagFormat}>{workspace.ctf.flagFormat}</code>}
                {workspace.ctf.lastSynced && (
                  <span>Synced {moment(workspace.ctf.lastSynced).fromNow()}</span>
                )}
                {syncStatus && <span className={styles.syncStatusInline}>{syncStatus}</span>}
              </p>
            ) : workspace.description ? (
              <p className={styles.description}>{workspace.description}</p>
            ) : null}
          </div>
        </div>
        <div className={styles.headerRight}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginRight: 8 }}>
            <Tooltip title="Max agentic turns per run for sessions in this workspace (default 25). Affects new agent runs only.">
              <span style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>
                Max turns
              </span>
            </Tooltip>
            <Select
              size="small"
              value={turnLimit}
              onChange={(val) => updateTurns.mutate(val)}
              loading={updateTurns.isLoading}
              style={{ width: 76 }}
              options={turnChoices.map((n) => ({ value: n, label: `${n}` }))}
              popupMatchSelectWidth={false}
            />
            <Popover
              content={guardrailsPopoverContent}
              title={
                <span style={{ fontSize: 13 }}>
                  Guardrails &amp; Scope
                  {autonomousMode && (
                    <Tag color="gold" style={{ marginLeft: 8, fontSize: 11 }}>
                      AUTONOMOUS
                    </Tag>
                  )}
                </span>
              }
              trigger="click"
              placement="bottomRight"
            >
              <Button size="small" icon={<SettingOutlined />} title="Agent guardrails & scope settings" />
            </Popover>
          </div>
          {isCTF && ctfConnected && (
            <>
              <Tooltip
                title={
                  solvableChallenges.length === 0
                    ? "Nothing to solve — every challenge is solved or has no session yet"
                    : null
                }
              >
                <Button
                  icon={solvingAll ? <LoadingOutlined /> : <PlayCircleOutlined />}
                  onClick={handleSolveAll}
                  disabled={solvingAll || solvableChallenges.length === 0}
                  size="small"
                  className={styles.solveAllBtn}
                >
                  {solvingAll ? "Starting..." : `Start Solving All (${solvableChallenges.length})`}
                </Button>
              </Tooltip>
              <Button
                icon={<SyncOutlined spin={syncing} />}
                onClick={handleSync}
                disabled={syncing}
                size="small"
                className={styles.syncBtn}
              >
                {syncing ? "Syncing..." : "Sync Challenges"}
              </Button>
              <Button
                icon={<DisconnectOutlined />}
                onClick={handleDisconnect}
                size="small"
                className={styles.disconnectBtn}
              >
                Disconnect
              </Button>
            </>
          )}
          {isCTF && !ctfConnected && (
            <PrimaryButton
              onClick={() => setShowCtfConnect(true)}
              className={`${styles.compactBtn} ${styles.connectCtfBtn}`}
            >
              <LinkOutlined /> Connect CTF
            </PrimaryButton>
          )}
          <PrimaryButton
            onClick={() => setShowNewSession(true)}
            className={`${styles.compactBtn} ${styles.newSessionBtn}`}
          >
            <PlusOutlined /> New Session
          </PrimaryButton>
        </div>
      </div>

      <div className={styles.metricsBar}>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Active Sessions</span>
          <span className={styles.metricValue}>{activeSessions}</span>
          <span className={styles.metricSub}>{idleSessions} idle</span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Target / Scope</span>
          <span className={styles.metricValueSm} title={targetInfo}>
            {targetInfo}
          </span>
          <span className={styles.metricSub}>
            {isCTF ? "CTF event" : "workspace scope"}
          </span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Tokens Used</span>
          <span className={styles.metricValue}>{tokensUsed.toLocaleString()}</span>
          <span className={styles.metricSub}>in this workspace</span>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.sectionHeader}>
          <h2>{isCTF && ctfConnected ? "Challenges" : "Sessions"}</h2>
          <span className={styles.sessionCount}>
            {isCTF && ctfConnected
              ? `${challenges.length} challenge${challenges.length !== 1 ? "s" : ""}`
              : `${sessions.length} session${sessions.length !== 1 ? "s" : ""}`
            }
          </span>
        </div>

        {isCTF && ctfConnected && syncing && syncProgress && (
          <SyncProgressPanel progress={syncProgress} styles={styles} />
        )}
        {isCTF && ctfConnected && !syncing && syncResult && (
          <SyncResultPanel result={syncResult} styles={styles} />
        )}
        {isCTF && ctfConnected && !syncing && syncError && (
          <div className={styles.syncError}>{syncError}</div>
        )}

        {isCTF && ctfConnected && challengesLoading ? (
          <div className={styles.challengeListLoading}>
            <LoadingOutlined /> Loading challenges...
          </div>
        ) : isCTF && ctfConnected && challenges.length > 0 ? (
          <ChallengeTable
            challenges={challenges}
            activeSolveName={activeSolve?.name}
            submittingFlag={submittingFlag}
            onSolve={handleChallengeSolve}
            onSubmit={handleSubmitFlag}
            onRowClick={handleChallengeRowClick}
            renderExtraActions={renderChallengeExtraActions}
          />
        ) : sessions.length === 0 ? (
          <div className={styles.emptyState}>
            <Empty
              description={
                isCTF && ctfConnected
                  ? "Sync challenges to auto-create sessions"
                  : "Create a session to get started"
              }
            />
          </div>
        ) : (
          <div className={styles.sessionTable}>
            <div className={styles.sessionTableHeader}>
              <span>Session</span>
              <span>Engine</span>
              <span>Status</span>
              <span>Created</span>
              <span style={{ textAlign: "right" }}>Actions</span>
            </div>
            {sessions.map((session) => {
              const stateInfo = STATE_DOT[session.agentState] || STATE_DOT.idle;

              return (
                <div
                  key={session.sessionId}
                  className={`${styles.sessionTableRow} ${session.agentState === "running" ? styles.sessionTableRowRunning : ""}`}
                  onClick={() => router.push(`/session/${session.sessionId}`)}
                >
                  <span className={styles.sessionNameCell}>
                    <span className={styles.sessionNameInner}>
                      <Tooltip title={stateInfo.label}>
                        <span className={styles.stateDot} style={{ background: stateInfo.color }} />
                      </Tooltip>
                      <span className={styles.sessionNameText}>{session.name}</span>
                    </span>
                    {session.description && (
                      <span className={styles.sessionDescInline}>{session.description}</span>
                    )}
                  </span>
                  <span className={styles.sessionEngineCell}>
                    <span className={styles.engineTag}>DeepSeek</span>
                    <span className={styles.engineTokens}>
                      {(session.totalTokens || 0).toLocaleString()} tokens
                    </span>
                  </span>
                  <span>
                    <span className={`${styles.agentStateBadge} ${styles[`agentState_${session.agentState || "idle"}`]}`}>
                      {stateInfo.label}
                    </span>
                  </span>
                  <span className={styles.sessionDateCol}>
                    {moment(session.createdAt).format("MMM D, YYYY")}
                  </span>
                  <span className={styles.sessionActionCol} onClick={(e) => e.stopPropagation()}>
                    <Tooltip title="Open">
                      <Button
                        size="small"
                        type="default"
                        icon={<PlayCircleOutlined />}
                        onClick={() => router.push(`/session/${session.sessionId}`)}
                        className={styles.openBtn}
                      >
                        Open
                      </Button>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <div
                        className={styles.sessionActionBtn}
                        onClick={(e) => onDeleteSession(session.sessionId, e)}
                      >
                        <FiTrash size={11} />
                      </div>
                    </Tooltip>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Session Modal */}
      <ModalComponent
        show={showNewSession}
        setShow={setShowNewSession}
        heading="New session"
        subheading={`Create a session in "${workspace.name}"`}
        onCancel={() => { setShowNewSession(false); newSessionForm.resetFields(); }}
        footer={false}
        destroyOnClose
        width={500}
      >
        <div className={styles.formWrap}>
          <Form form={newSessionForm} layout="vertical" onFinish={createSessionMutation.mutate}>
            <Form.Item
              name="name"
              label="Session name"
              rules={[{ required: true, message: "Name is required" }]}
            >
              <Input placeholder="e.g. buffer-overflow, Target A" />
            </Form.Item>
            <Form.Item name="description" label="Description">
              <Input.TextArea placeholder="Optional description" rows={2} />
            </Form.Item>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <PrimaryButton white onClick={() => { setShowNewSession(false); newSessionForm.resetFields(); }}>
                Cancel
              </PrimaryButton>
              <PrimaryButton purple htmlType="submit" loading={createSessionMutation.isLoading}>
                Create Session
              </PrimaryButton>
            </div>
          </Form>
        </div>
      </ModalComponent>

      {/* CTF Connect Modal */}
      <ModalComponent
        show={showCtfConnect}
        setShow={setShowCtfConnect}
        heading="Connect CTF"
        subheading="Enter your CTFd platform credentials"
        onCancel={() => { setShowCtfConnect(false); setSyncStatus(""); }}
        footer={false}
        destroyOnClose
        width={500}
      >
        <div className={styles.formWrap}>
          <Form layout="vertical" onFinish={handleCtfConnect}>
            <Form.Item
              name="ctfUrl"
              label="CTFd URL"
              rules={[{ required: true, message: "URL is required" }]}
            >
              <Input placeholder="https://your-ctf.ctfd.io" />
            </Form.Item>
            <Form.Item label="Auth method">
              <Radio.Group
                value={ctfAuthMethod}
                onChange={(e) => setCtfAuthMethod(e.target.value)}
              >
                <Radio value="token"><FiKey size={12} /> API Token</Radio>
                <Radio value="credentials"><FiLock size={12} /> Credentials</Radio>
              </Radio.Group>
            </Form.Item>
            {ctfAuthMethod === "token" ? (
              <Form.Item name="apiToken" label="API Token" rules={[{ required: true }]}>
                <Input.Password placeholder="ctfd_xxx..." />
              </Form.Item>
            ) : (
              <>
                <Form.Item name="username" label="Username" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="password" label="Password" rules={[{ required: true }]}>
                  <Input.Password />
                </Form.Item>
              </>
            )}
            {syncStatus && <div className={styles.syncStatusBox}>{syncStatus}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <PrimaryButton purple htmlType="submit" loading={syncing}>
                Connect &amp; Sync
              </PrimaryButton>
            </div>
          </Form>
        </div>
      </ModalComponent>
    </div>
  );
};

const SyncProgressPanel = ({ progress, styles }) => {
  const { phase, current, total, name, action } = progress;
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const phaseLabel = phase === "fetch" ? "Fetching challenges" : "Syncing to workspace";
  const actionIcon =
    action === "new" ? "+" : action === "updated" ? "~" : action === "skipped" ? "-" : "";
  const actionClass =
    action === "new" ? styles.actionNew :
    action === "updated" ? styles.actionUpdated :
    action === "skipped" ? styles.actionSkipped : "";

  return (
    <div className={styles.progressPanel}>
      <div className={styles.progressHeader}>
        <span className={styles.progressPhase}>{phaseLabel}</span>
        <span className={styles.progressCount}>{current}/{total}</span>
      </div>
      <div className={styles.progressBarTrack}>
        <div className={styles.progressBarFill} style={{ width: `${pct}%` }} />
      </div>
      {name && (
        <div className={styles.progressCurrent}>
          {actionIcon && (
            <span className={`${styles.progressAction} ${actionClass}`}>{actionIcon}</span>
          )}
          <span className={styles.progressName}>{name}</span>
        </div>
      )}
    </div>
  );
};

const SyncResultPanel = ({ result, styles }) => {
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
        <span className={styles.resultBreakdown}>{parts.join(" · ")}</span>
      )}
    </div>
  );
};

export default WorkspaceDetailPage;
