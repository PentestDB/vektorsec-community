import styles from "@/styles/pages/Dashboard.module.scss";
import { Input, message, Table, Tooltip, Button, Space } from "antd";
import PrimaryButton from "@/components/common/PrimaryButton";
import {
  SearchOutlined,
  DeleteOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { AuthContextProvider } from "@/components/common/auth/AuthContext";

import Loader from "@/components/common/loader/Loader";
import { useSelector } from "react-redux";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { useState, useMemo } from "react";
import CreateSessionModal from "./CreateSessionModal";
import { deleteSession, getUserSessions } from "@/services/agent.service";
import moment from "moment";
import { useRouter, useSearchParams } from "next/navigation";
import { FiPlay, FiTrash } from "react-icons/fi";
import Image from "next/image";
import emptyBox from "@/assets/empty-box.svg";
import { useConfirmPopUp } from "@/components/common/ConfirmPopUp";
import { useDispatch } from "react-redux";
import { useEffect } from "react";
import { resetSessions } from "@/store/user.slice";
import { PiCodesandboxLogo } from "react-icons/pi";

const DashboardPage = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { user } = useSelector((state) => state.user);
  const confirmPopUp = useConfirmPopUp();

  const launchWorkspace = searchParams.get("launch") === "true";

  const [show, setShow] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  const dispatch = useDispatch();

  const { data: sessionsData, isLoading } = useQuery(
    ["get-user-sessions"],
    getUserSessions,
    {
      enabled: !!user,
    }
  );

  const filteredSessions = useMemo(() => {
    if (!sessionsData) return [];
    const term = searchTerm.trim().toLowerCase();
    if (!term) return sessionsData;
    return sessionsData.filter(
      (s) =>
        (s.name || "").toLowerCase().includes(term) ||
        (s.description || "").toLowerCase().includes(term) ||
        (s.sessionId || "").toLowerCase().includes(term)
    );
  }, [sessionsData, searchTerm]);

  const deleteSessionMutation = useMutation(deleteSession, {
    onSuccess: (data) => {
      message.success(data?.message ?? "Workspace deleted successfully!");
      queryClient.invalidateQueries(["get-user-sessions"]);
    },
    onError: (error) => {
      message.error(
        error?.response?.data?.message ?? "Failed to delete workspace!"
      );
    },
  });

  const columns = [
    {
      title: "Workspace ID",
      dataIndex: "sessionId",
      key: "sessionId",
      ellipsis: false,
      render: (text) => (
        <code className={styles.cellId}>{text || "—"}</code>
      ),
    },
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      ellipsis: true,
      render: (text) => (
        <span className={styles.cellName}>{text || "—"}</span>
      ),
    },
    {
      title: "Description",
      dataIndex: "description",
      key: "description",
      ellipsis: true,
      render: (text) => (
        <span className={styles.cellDescription}>{text || "—"}</span>
      ),
    },
    {
      title: "Created",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 110,
      render: (text) => (
        <span className={styles.cellDate}>
          {text ? moment(text).format("MMM D, YYYY") : "—"}
        </span>
      ),
    },
    {
      title: "",
      key: "actions",
      width: 100,
      align: "right",
      render: (_, record) => (
        <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
          <Tooltip
            title={
              record.boxStatus && record.boxStatus !== "stopped"
                ? "Exploit Box is running"
                : "Open workspace"
            }
          >
            <div
              className={`${styles.btnWrapGreen} ${
                record.boxStatus && record.boxStatus !== "stopped"
                  ? styles.activeExploitBox
                  : ""
              }`}
              onClick={() => router.push(`/session/${record.sessionId}`)}
            >
              {record.boxStatus && record.boxStatus !== "stopped" ? (
                <PiCodesandboxLogo className={styles.iconBtn} />
              ) : (
                <FiPlay className={styles.iconBtn} />
              )}
            </div>
          </Tooltip>

          <Tooltip title="Delete">
            <div
              className={styles.btnWrapRed}
              onClick={(e) => onDeleteOne(record.sessionId, e)}
            >
              <FiTrash className={styles.iconBtn} />
            </div>
          </Tooltip>
        </div>
      ),
    },
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys),
    columnWidth: 48,
    getCheckboxProps: (record) => ({
      onClick: (e) => e.stopPropagation(),
    }),
  };

  const onDeleteOne = (sessionId, e) => {
    e?.stopPropagation?.();
    confirmPopUp({
      title: "Delete workspace?",
      content: "This workspace will be archived. You can no longer access it.",
      okText: "Delete",
      cancelText: "Cancel",
      onOk: async () => {
        await deleteSessionMutation.mutateAsync({ sessionId });
      },
    });
  };

  const onBulkDelete = () => {
    if (selectedRowKeys.length === 0) return;
    confirmPopUp({
      title: `Delete ${selectedRowKeys.length} workspace${selectedRowKeys.length > 1 ? "s" : ""}?`,
      content:
        "Selected workspaces will be archived. You will no longer be able to access them.",
      okText: "Delete",
      cancelText: "Cancel",
      onOk: async () => {
        await Promise.all(
          selectedRowKeys.map((sessionId) =>
            deleteSessionMutation.mutateAsync({ sessionId })
          )
        );
        setSelectedRowKeys([]);
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

  useEffect(() => {
    setSelectedRowKeys((prev) =>
      prev.filter((key) => filteredSessions.some((s) => s.sessionId === key))
    );
  }, [filteredSessions]);

  if (!user || isLoading) {
    return <Loader />;
  }

  return (
    <AuthContextProvider>
      <div className={styles.dashboardContainer}>
        <div className={styles.dashboardHeader}>
          <h1 className={styles.Title}>Workspaces</h1>
          <div className={styles.headerActions}>
            <Input
              prefix={<SearchOutlined className={styles.searchIcon} />}
              placeholder="Search by name, description, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              allowClear
              className={styles.searchBox}
            />
            <PrimaryButton purple onClick={() => setShow(true)}>
              <PlusOutlined /> Create Workspace
            </PrimaryButton>
          </div>
        </div>

        <div className={styles.sessionsList}>
          <div className={styles.tableToolbar}>
            {selectedRowKeys.length > 0 && (
              <Space className={styles.bulkActions}>
                <span className={styles.selectedCount}>
                  {selectedRowKeys.length} selected
                </span>
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={onBulkDelete}
                  className={styles.bulkDeleteBtn}
                >
                  Delete selected
                </Button>
                <Button
                  type="text"
                  size="small"
                  onClick={() => setSelectedRowKeys([])}
                  className={styles.clearSelectionBtn}
                >
                  Clear selection
                </Button>
              </Space>
            )}
          </div>

          <div className={styles.sessionsListTable}>
            {filteredSessions.length === 0 ? (
              <div className={styles.placeholder}>
                <Image
                  src={emptyBox}
                  alt=""
                  width={110}
                  height={110}
                  className={styles.placeImage}
                />
                <h3>
                  {sessionsData?.length
                    ? "No workspaces match your search"
                    : "Create your first workspace"}
                </h3>
                <p>
                  {sessionsData?.length
                    ? "Try a different search term."
                    : "Start a new penetration testing session and let the AI assist you."}
                </p>
                <PrimaryButton
                  white
                  onClick={() => (sessionsData?.length ? setSearchTerm("") : setShow(true))}
                >
                  {sessionsData?.length ? "Clear search" : "Create Workspace"}
                </PrimaryButton>
              </div>
            ) : (
              <Table
                rowKey="sessionId"
                size="small"
                columns={columns}
                dataSource={filteredSessions}
                rowSelection={rowSelection}
                pagination={{
                  pageSize: 10,
                  showSizeChanger: true,
                  showTotal: (total) => `${total} workspace${total !== 1 ? "s" : ""}`,
                  pageSizeOptions: ["10", "20", "50"],
                  size: "small",
                }}
                onRow={({ sessionId }) => ({
                  onClick: () => router.push(`/session/${sessionId}`),
                })}
              />
            )}
          </div>
        </div>
      </div>

      <CreateSessionModal
        show={show}
        setShow={setShow}
        close={() => setShow(false)}
      />
    </AuthContextProvider>
  );
};

export default DashboardPage;
