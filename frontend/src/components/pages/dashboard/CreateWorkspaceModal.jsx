import ModalComponent from "@/components/common/ModalComponent";
import PrimaryButton from "@/components/common/PrimaryButton";
import { Form, Input, message, Row, Radio, Steps } from "antd";
import styles from "@/styles/pages/Dashboard.module.scss";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "react-query";
import { createWorkspace } from "@/services/workspace.service";
import { connectCtf, syncCtfStream } from "@/services/ctf.service";
import { useState, useCallback } from "react";
import { FiFlag, FiShield, FiLock, FiKey } from "react-icons/fi";

const CreateWorkspaceModal = ({ show, setShow, close }) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [step, setStep] = useState(0);
  const [workspaceType, setWorkspaceType] = useState("ctf");
  const [createdWorkspaceId, setCreatedWorkspaceId] = useState(null);
  const [ctfAuthMethod, setCtfAuthMethod] = useState("token");
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");

  const resetState = useCallback(() => {
    setStep(0);
    setWorkspaceType("ctf");
    setCreatedWorkspaceId(null);
    setCtfAuthMethod("token");
    setSyncing(false);
    setSyncStatus("");
    form.resetFields();
  }, [form]);

  const handleClose = () => {
    resetState();
    close();
  };

  const createWorkspaceMutation = useMutation(createWorkspace, {
    onSuccess: (data) => {
      queryClient.invalidateQueries(["get-user-workspaces"]);
      setCreatedWorkspaceId(data.workspaceId);

      if (workspaceType === "ctf") {
        setStep(1);
      } else {
        message.success("Workspace created!");
        router.push(`/workspace/${data.workspaceId}`);
        handleClose();
      }
    },
    onError: (error) => {
      message.error(
        error?.response?.data?.message ?? "Failed to create workspace!"
      );
    },
  });

  const handleStep1 = async (values) => {
    const type = workspaceType;
    await createWorkspaceMutation.mutateAsync({
      name: values.name,
      description: values.description,
      type,
    });
  };

  const handleCtfConnect = async (values) => {
    if (!createdWorkspaceId) return;

    try {
      setSyncing(true);
      setSyncStatus("Connecting to CTFd...");

      const connectBody =
        ctfAuthMethod === "token"
          ? { url: values.ctfUrl, apiToken: values.apiToken }
          : { url: values.ctfUrl, username: values.username, password: values.password };

      const connectResult = await connectCtf(createdWorkspaceId, connectBody);

      const finish = (notify) => {
        queryClient.invalidateQueries(["get-user-workspaces"]);
        notify();
        router.push(`/workspace/${createdWorkspaceId}`);
        handleClose();
      };

      // The CTF is connected but not serving challenges yet (not started, or
      // team mode with no team). The workspace is valid — keep it and let the
      // user sync from the workspace page once the event opens.
      if (connectResult?.challengesAvailable === false) {
        finish(() =>
          message.info(
            connectResult.unavailableReason ||
              "Connected, but challenges aren't available yet. Use Sync Challenges once the CTF starts.",
            8,
          ),
        );
        return;
      }

      setSyncStatus("Connected! Syncing challenges...");

      try {
        await new Promise((resolve, reject) => {
          syncCtfStream(
            createdWorkspaceId,
            (event) => {
              if (event.phase === "fetch") {
                setSyncStatus(`Fetching challenges... ${event.current || ""}/${event.total || "?"}`);
              } else if (event.phase === "sync") {
                setSyncStatus(`Syncing: ${event.name || ""} (${event.current}/${event.total})`);
              } else if (event.phase === "done") {
                setSyncStatus(`Done! ${event.total} challenges synced.`);
              } else if (event.phase === "error") {
                reject(new Error(event.detail || "Sync failed"));
              }
            },
            resolve,
            reject,
          );
        });
      } catch (syncErr) {
        // Connection already saved — a sync failure must not discard the
        // workspace. Hand the user their workspace with the reason instead.
        finish(() =>
          message.warning(
            `Connected, but syncing challenges failed: ${syncErr?.message || "unknown error"}. You can retry with Sync Challenges.`,
            8,
          ),
        );
        return;
      }

      finish(() => message.success("Workspace created and CTF synced!"));
    } catch (err) {
      message.error(
        err?.response?.data?.message || err?.message || "Failed to connect to CTF",
        8,
      );
      setSyncStatus("");
    } finally {
      setSyncing(false);
    }
  };

  const skipCtf = () => {
    message.success("Workspace created! You can connect CTF later.");
    router.push(`/workspace/${createdWorkspaceId}`);
    handleClose();
  };

  const stepItems = [
    { title: "Workspace" },
    ...(workspaceType === "ctf" ? [{ title: "CTF Setup" }] : []),
  ];

  return (
    <ModalComponent
      show={show}
      setShow={setShow}
      heading="Create new workspace"
      subheading={
        step === 0
          ? "Set up a workspace for your engagement"
          : "Connect to your CTF platform"
      }
      onCancel={handleClose}
      footer={false}
      destroyOnClose
      width={"80%"}
    >
      <div className={styles.createSession}>
        {workspaceType === "ctf" && (
          <Steps
            current={step}
            items={stepItems}
            size="small"
            style={{ marginBottom: "1.5rem" }}
          />
        )}

        {step === 0 && (
          <Form form={form} layout="vertical" onFinish={handleStep1}>
            <Form.Item
              name="name"
              label="Workspace name"
              rules={[{ required: true, message: "Name is required" }]}
            >
              <Input placeholder="e.g. PicoCTF 2026, Client Pentest" />
            </Form.Item>

            <Form.Item name="description" label="Description">
              <Input.TextArea
                placeholder="What is this workspace for?"
                rows={3}
              />
            </Form.Item>

            <Form.Item label="Workspace type">
              <div className={styles.typeSelector}>
                {[
                  { key: "ctf", label: "CTF", icon: <FiFlag />, desc: "Capture The Flag competition" },
                  { key: "pentest", label: "Pentest", icon: <FiShield />, desc: "Penetration testing engagement" },
                ].map((t) => (
                  <div
                    key={t.key}
                    className={`${styles.typeOption} ${workspaceType === t.key ? styles.typeSelected : ""}`}
                    onClick={() => setWorkspaceType(t.key)}
                  >
                    <span className={styles.typeIcon}>{t.icon}</span>
                    <span className={styles.typeLabel}>{t.label}</span>
                    <span className={styles.typeDesc}>{t.desc}</span>
                  </div>
                ))}
              </div>
            </Form.Item>

            <Row justify="end">
              <PrimaryButton
                purple
                htmlType="submit"
                loading={createWorkspaceMutation.isLoading}
              >
                {workspaceType === "ctf" ? "Next" : "Create Workspace"}
              </PrimaryButton>
            </Row>
          </Form>
        )}

        {step === 1 && (
          <Form layout="vertical" onFinish={handleCtfConnect}>
            <Form.Item
              name="ctfUrl"
              label="CTFd URL"
              rules={[{ required: true, message: "CTFd URL is required" }]}
            >
              <Input placeholder="https://your-ctf.ctfd.io" />
            </Form.Item>

            <Form.Item label="Authentication method">
              <Radio.Group
                value={ctfAuthMethod}
                onChange={(e) => setCtfAuthMethod(e.target.value)}
                style={{ marginBottom: 8 }}
              >
                <Radio value="token">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <FiKey size={12} /> API Token
                  </span>
                </Radio>
                <Radio value="credentials">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <FiLock size={12} /> Credentials
                  </span>
                </Radio>
              </Radio.Group>
            </Form.Item>

            {ctfAuthMethod === "token" ? (
              <Form.Item
                name="apiToken"
                label="API Token"
                rules={[{ required: true, message: "Token is required" }]}
              >
                <Input.Password placeholder="ctfd_xxx..." />
              </Form.Item>
            ) : (
              <>
                <Form.Item
                  name="username"
                  label="Username"
                  rules={[{ required: true, message: "Username is required" }]}
                >
                  <Input placeholder="Your CTFd username" />
                </Form.Item>
                <Form.Item
                  name="password"
                  label="Password"
                  rules={[{ required: true, message: "Password is required" }]}
                >
                  <Input.Password placeholder="Your CTFd password" />
                </Form.Item>
              </>
            )}

            {syncStatus && (
              <div className={styles.syncStatus}>{syncStatus}</div>
            )}

            <Row justify="space-between">
              <PrimaryButton white onClick={skipCtf} disabled={syncing}>
                Skip for now
              </PrimaryButton>
              <PrimaryButton purple htmlType="submit" loading={syncing}>
                Connect &amp; Sync
              </PrimaryButton>
            </Row>
          </Form>
        )}
      </div>
    </ModalComponent>
  );
};

export default CreateWorkspaceModal;
