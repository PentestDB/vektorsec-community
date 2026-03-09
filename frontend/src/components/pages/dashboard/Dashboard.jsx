import styles from "@/styles/pages/Dashboard.module.scss";
import { Input, message, Table, Tooltip } from "antd";
import PrimaryButton from "@/components/common/PrimaryButton";
import { SearchOutlined } from "@ant-design/icons";
import { AuthContextProvider } from "@/components/common/auth/AuthContext";

import Loader from "@/components/common/loader/Loader";
import { useSelector } from "react-redux";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { useState } from "react";
import CreateSessionModal from "./CreateSessionModal";
import { deleteSession, getUserSessions } from "@/services/agent.service";
import moment from "moment";
import { useRouter, useSearchParams } from "next/navigation";
import { FiPlay, FiTrash } from "react-icons/fi";
import Image from "next/image";
import emptyBox from "@/assets/empty-box.svg";
import { confirmPopUp } from "@/components/common/ConfirmPopUp";
import { useDispatch } from "react-redux";
import { useEffect } from "react";
import { resetSessions } from "@/store/user.slice";
import { PiCodesandboxLogo } from "react-icons/pi";

const DashboardPage = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { user } = useSelector((state) => state.user);

  const launchWorkspace = searchParams.get("launch") === "true";

  const [show, setShow] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const dispatch = useDispatch();

  const { data: sessionsData, isLoading } = useQuery(
    ["get-user-sessions"],
    getUserSessions,
    {
      enabled: !!user,
    }
  );

  const deleteSessionMutation = useMutation(deleteSession, {
    onSuccess: (data) => {
      message.success(data?.message ?? "Workspace deleted successfully!");
      queryClient.invalidateQueries(["get-user-sessions"]);
    },
    onError: (error) => {
      console.log(error);
      message.error(
        error?.response?.data?.message ?? "Failed to delete workspace!"
      );
    },
  });

  const columns = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
    },
    {
      title: "Description",
      dataIndex: "description",
      key: "description",
    },
    {
      title: "Workspace ID",
      dataIndex: "sessionId",
      key: "sessionId",
    },
    {
      title: "Date",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (text) => moment(text).format("Do MMM YYYY"),
    },
    {
      title: "Actions",
      key: "actions",
      render: (_, record) => (
        <div className={styles.actions}>
          <Tooltip
            title={
              record.boxStatus && record.boxStatus !== "stopped"
                ? "Exploit Box is running"
                : "Resume workspace"
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

          <Tooltip title="Delete Workspace">
            <div
              className={styles.btnWrapRed}
              onClick={(e) => onDelete(record.sessionId, e)}
            >
              <FiTrash className={styles.iconBtn} />
            </div>
          </Tooltip>
        </div>
      ),
    },
  ];

  const filterSessions = (sessions) => {
    if (!sessions) {
      return [];
    }

    const filtered = sessions.filter(
      (session) =>
        session.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        session.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        session.sessionId.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return filtered;
  };

  const onDelete = (session_id, e) => {
    e.stopPropagation();

    confirmPopUp({
      title: "Delete Workspace?",
      content: "Are you sure you want to delete this workspace?",
      okText: "Yes",
      cancelText: "No",
      onOk: async () => {
        await deleteSessionMutation.mutateAsync({ session_id });
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
    <AuthContextProvider>
      <div className={styles.dashboardContainer}>
        <div className={styles.dashboardHeader}>
          <h1 className={styles.Title}>Workspaces</h1>
          <div className={styles.headerActions}>
            <Input
              suffix={<SearchOutlined />}
              className={styles.searchBox}
              placeholder="Search your workspace"
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <PrimaryButton purple onClick={() => setShow(true)}>
              <FiPlay /> Create New Workspace
            </PrimaryButton>
          </div>
        </div>
        <div className={styles.sessionsList}>
          <div className={styles.sessionsListTable}>
            {filterSessions(sessionsData).length === 0 ? (
              <div className={styles.placeholder}>
                <Image
                  src={emptyBox}
                  alt=""
                  width={110}
                  height={110}
                  className={styles.placeImage}
                />
                <h3>Create your first workspace</h3>
                <p>
                  Initiate debut workspace, commence hacking endeavors with
                  unwavering determination.
                </p>
                <PrimaryButton white onClick={() => setShow(true)}>
                  Start Hacking
                </PrimaryButton>
              </div>
            ) : (
              <Table
                columns={columns}
                pagination={
                  filterSessions(sessionsData)?.length > 10
                    ? {
                        pageSize: 10,
                        total: filterSessions(sessionsData)?.length,
                        showSizeChanger: false,
                      }
                    : false
                }
                dataSource={filterSessions(sessionsData)}
                onRow={({ sessionId }) => {
                  return {
                    onClick: () => {
                      router.push(`/session/${sessionId}`);
                    },
                  };
                }}
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
