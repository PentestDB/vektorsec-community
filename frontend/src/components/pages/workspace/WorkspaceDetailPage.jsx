import styles from "@/styles/pages/WorkspaceDetail.module.scss";
import { message, Tag, Tooltip, Input, Form, Radio, Empty, Button, Spin } from "antd";
import PrimaryButton from "@/components/common/PrimaryButton";
import {
  PlusOutlined,
  ArrowLeftOutlined,
  SyncOutlined,
  LinkOutlined,
  DisconnectOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import Loader from "@/components/common/loader/Loader";
import { useSelector } from "react-redux";
import { useQuery, useMutation, useQueryClient } from "react-query";
import { useState, useMemo, useCallback } from "react";
import { getWorkspaceDetail, createSessionInWorkspace } from "@/services/workspace.service";
import { getCtfChallenges, connectCtf, syncCtfStream, disconnectCtf, submitFlagToCtfd } from "@/services/ctf.service";
import { deleteSession } from "@/services/agent.service";
import moment from "moment";
import { useRouter } from "next/navigation";
import { FiTrash, FiFlag, FiKey, FiLock } from "react-icons/fi";
import ModalComponent from "@/components/common/ModalComponent";
import { useConfirmPopUp } from "@/components/common/ConfirmPopUp";
import ChallengeTable from "@/components/common/ChallengeTable";

const STATE_DOT = {
  running: { color: "#10ca00", label: "Running" },
  idle: { color: "#6b7280", label: "Idle" },
  paused: { color: "#d29922", label: "Paused" },
  waiting_consent: { color: "#d29922", label: "Waiting" },
  waiting_manual_execution: { color: "#d29922", label: "Waiting" },
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

      await connectCtf(workspaceId, body);
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
      message.error(err?.message || "Failed to connect CTF");
      setSyncStatus("");
    } finally {
      setSyncing(false);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      setSyncStatus("Syncing...");

      await new Promise((resolve, reject) => {
        syncCtfStream(
          workspaceId,
          (event) => {
            if (event.phase === "done") {
              setSyncStatus(`Synced ${event.total} challenges`);
            } else if (event.phase === "error") {
              reject(new Error(event.detail));
            }
          },
          resolve,
          reject,
        );
      });

      queryClient.invalidateQueries(["workspace-detail", workspaceId]);
      queryClient.invalidateQueries(["ctf-challenges", workspaceId]);
      message.success("Challenges synced!");
      setSyncStatus("");
    } catch (err) {
      message.error(err?.message || "Sync failed");
      setSyncStatus("");
    } finally {
      setSyncing(false);
    }
  };

  const [submittingFlag, setSubmittingFlag] = useState(null);

  const challenges = challengesData?.challenges || [];
  const activeSolve = challengesData?.activeSolve ?? null;
  const isCTF = workspace?.type === "ctf";
  const ctfConnected = workspace?.ctf?.connected;
  const sessions = workspace?.sessions || [];

  const sessionsByName = useMemo(() => {
    const map = {};
    sessions.forEach((s) => { map[s.name] = s; });
    return map;
  }, [sessions]);

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
                workspace.type === "ctf" ? "#f59e0b" :
                workspace.type === "pentest" ? "#8b5cf6" : "#6b7280"
              }>
                {workspace.type?.toUpperCase()}
              </Tag>
            </div>
            {workspace.description && (
              <p className={styles.description}>{workspace.description}</p>
            )}
          </div>
        </div>
        <div className={styles.headerRight}>
          {isCTF && ctfConnected && (
            <>
              <PrimaryButton
                white
                onClick={handleSync}
                loading={syncing}
                className={styles.compactBtn}
              >
                <SyncOutlined /> Sync Challenges
              </PrimaryButton>
              <Tooltip title="Disconnect CTF">
                <button className={styles.disconnectBtn} onClick={handleDisconnect}>
                  <DisconnectOutlined />
                </button>
              </Tooltip>
            </>
          )}
          {isCTF && !ctfConnected && (
            <PrimaryButton
              white
              onClick={() => setShowCtfConnect(true)}
              className={styles.compactBtn}
            >
              <LinkOutlined /> Connect CTF
            </PrimaryButton>
          )}
          <PrimaryButton purple onClick={() => setShowNewSession(true)} className={styles.compactBtn}>
            <PlusOutlined /> New Session
          </PrimaryButton>
        </div>
      </div>

      {isCTF && ctfConnected && (
        <div className={styles.ctfBar}>
          <span className={styles.ctfName}>
            <FiFlag size={13} /> {workspace.ctf.ctfName}
          </span>
          <span className={styles.ctfUrl}>{workspace.ctf.url}</span>
          {workspace.ctf.flagFormat && (
            <code className={styles.flagFormat}>{workspace.ctf.flagFormat}</code>
          )}
          {workspace.ctf.lastSynced && (
            <span className={styles.lastSync}>
              Synced {moment(workspace.ctf.lastSynced).fromNow()}
            </span>
          )}
          {syncStatus && <span className={styles.syncStatusInline}>{syncStatus}</span>}
        </div>
      )}

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

        {isCTF && ctfConnected && challengesLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "3rem 0" }}>
            <Spin size="small" />
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

export default WorkspaceDetailPage;
