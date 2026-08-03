import styles from "@/styles/pages/Dashboard.module.scss";
import { Input, message, Tooltip, Tag } from "antd";
import PrimaryButton from "@/components/common/PrimaryButton";
import {
  SearchOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import Loader from "@/components/common/loader/Loader";
import { useSelector } from "react-redux";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { useState, useMemo } from "react";
import CreateWorkspaceModal from "./CreateWorkspaceModal";
import { getUserWorkspaces, deleteWorkspace } from "@/services/workspace.service";
import moment from "moment";
import { useRouter, useSearchParams } from "next/navigation";
import { FiTrash, FiFolder, FiFlag, FiShield } from "react-icons/fi";
import Image from "next/image";
import emptyBox from "@/assets/empty-box.svg";
import { useConfirmPopUp } from "@/components/common/ConfirmPopUp";
import { useDispatch } from "react-redux";
import { useEffect } from "react";
import { resetSessions } from "@/store/user.slice";

const TYPE_CONFIG = {
  ctf: { label: "CTF", color: "#f59e0b", icon: <FiFlag size={14} /> },
  pentest: { label: "Pentest", color: "#8b5cf6", icon: <FiShield size={14} /> },
  general: { label: "General", color: "#6b7280", icon: <FiFolder size={14} /> },
};

const DashboardPage = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { user } = useSelector((state) => state.user);
  const confirmPopUp = useConfirmPopUp();

  const launchWorkspace = searchParams.get("launch") === "true";

  const [show, setShow] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const dispatch = useDispatch();

  const { data: workspacesData, isLoading } = useQuery(
    ["get-user-workspaces"],
    getUserWorkspaces,
    {
      enabled: !!user,
      refetchInterval: 10000,
    }
  );

  const filteredWorkspaces = useMemo(() => {
    if (!workspacesData) return [];
    const term = searchTerm.trim().toLowerCase();
    if (!term) return workspacesData;
    return workspacesData.filter(
      (w) =>
        (w.name || "").toLowerCase().includes(term) ||
        (w.description || "").toLowerCase().includes(term) ||
        (w.workspaceId || "").toLowerCase().includes(term)
    );
  }, [workspacesData, searchTerm]);

  const deleteWorkspaceMutation = useMutation(deleteWorkspace, {
    onSuccess: (data) => {
      message.success(data?.message ?? "Workspace deleted successfully!");
      queryClient.invalidateQueries(["get-user-workspaces"]);
    },
    onError: (error) => {
      message.error(
        error?.response?.data?.message ?? "Failed to delete workspace!"
      );
    },
  });

  const onDeleteWorkspace = (workspaceId, e) => {
    e?.stopPropagation?.();
    confirmPopUp({
      title: "Delete workspace?",
      content: "This workspace and all its sessions will be archived.",
      okText: "Delete",
      cancelText: "Cancel",
      onOk: async () => {
        await deleteWorkspaceMutation.mutateAsync({ workspaceId });
      },
    });
  };

  useEffect(() => {
    dispatch(resetSessions());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (launchWorkspace) {
      setShow(true);
    }
  }, [launchWorkspace]);

  if (!user || isLoading) {
    return <Loader />;
  }

  return (
    <>
      <div className={styles.dashboardContainer}>
        <div className={styles.dashboardHeader}>
          <h1 className={styles.Title}>Workspaces</h1>
          <div className={styles.headerActions}>
            <Input
              prefix={<SearchOutlined className={styles.searchIcon} />}
              placeholder="Search workspaces..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              allowClear
              className={styles.searchBox}
            />
            <PrimaryButton purple onClick={() => setShow(true)}>
              <PlusOutlined /> New Workspace
            </PrimaryButton>
          </div>
        </div>

        <div className={styles.workspaceGrid}>
          {filteredWorkspaces.length === 0 ? (
            <div className={styles.placeholder}>
              <Image
                src={emptyBox}
                alt=""
                width={110}
                height={110}
                className={styles.placeImage}
              />
              <h3>
                {workspacesData?.length
                  ? "No workspaces match your search"
                  : "Create your first workspace"}
              </h3>
              <p>
                {workspacesData?.length
                  ? "Try a different search term."
                  : "Organize your pentests and CTF challenges into workspaces."}
              </p>
              <PrimaryButton
                white
                onClick={() =>
                  workspacesData?.length ? setSearchTerm("") : setShow(true)
                }
              >
                {workspacesData?.length ? "Clear search" : "Create Workspace"}
              </PrimaryButton>
            </div>
          ) : (
            <div className={styles.cardGrid}>
              {filteredWorkspaces.map((workspace) => {
                const typeConf = TYPE_CONFIG[workspace.type] || TYPE_CONFIG.general;
                const sessions = workspace.sessions || {};
                const hasActivity = sessions.running > 0 || sessions.waiting > 0;

                return (
                  <div
                    key={workspace.workspaceId}
                    className={`${styles.workspaceCard} ${hasActivity ? styles.activeCard : ""}`}
                    onClick={() => router.push(`/workspace/${workspace.workspaceId}`)}
                  >
                    <div className={styles.cardHeader}>
                      <div className={styles.cardTitleRow}>
                        <span className={styles.cardIcon}>{typeConf.icon}</span>
                        <h3 className={styles.cardTitle}>{workspace.name}</h3>
                      </div>
                      <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
                        <Tooltip title="Delete workspace">
                          <div
                            className={styles.deleteBtn}
                            onClick={(e) => onDeleteWorkspace(workspace.workspaceId, e)}
                          >
                            <FiTrash size={13} />
                          </div>
                        </Tooltip>
                      </div>
                    </div>

                    {workspace.description && (
                      <p className={styles.cardDescription}>{workspace.description}</p>
                    )}

                    <div className={styles.cardMeta}>
                      <Tag
                        color={typeConf.color}
                        className={styles.typeTag}
                      >
                        {typeConf.label}
                      </Tag>
                      <span className={styles.cardDate}>
                        {moment(workspace.createdAt).format("MMM D, YYYY")}
                      </span>
                    </div>

                    <div className={styles.sessionStats}>
                      <div className={styles.statItem}>
                        <span className={styles.statCount}>{sessions.total || 0}</span>
                        <span className={styles.statLabel}>
                          {sessions.total === 1 ? "session" : "sessions"}
                        </span>
                      </div>
                      {sessions.running > 0 && (
                        <div className={`${styles.statItem} ${styles.statRunning}`}>
                          <span className={styles.liveDot} />
                          <span className={styles.statCount}>{sessions.running}</span>
                          <span className={styles.statLabel}>running</span>
                        </div>
                      )}
                      {sessions.waiting > 0 && (
                        <div className={`${styles.statItem} ${styles.statWaiting}`}>
                          <span className={styles.waitDot} />
                          <span className={styles.statCount}>{sessions.waiting}</span>
                          <span className={styles.statLabel}>waiting</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <CreateWorkspaceModal
        show={show}
        setShow={setShow}
        close={() => setShow(false)}
      />
    </>
  );
};

export default DashboardPage;
