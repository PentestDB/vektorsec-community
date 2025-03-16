import { Col, Dropdown, Tooltip, message, notification } from "antd";
import { AiOutlineDoubleLeft } from "react-icons/ai";
import PrimaryButton from "./PrimaryButton";
import styles from "@/styles/pages/Session.module.scss";
import Image from "next/image";
import vpn from "@/assets/sidebar/vpn.svg";
import terminal from "@/assets/sidebar/terminal.svg";
import netcat from "@/assets/sidebar/netcat.svg";
import todo from "@/assets/sidebar/todo.svg";
// import findstep from "@/assets/sidebar/findstep.svg";
import quad from "@/assets/sidebar/quad.svg";
import docs from "@/assets/sidebar/docs.svg";
import help from "@/assets/sidebar/help.svg";
import rect from "@/assets/sidebar/rect.svg";
import { PlusOutlined } from "@ant-design/icons";
import { useDispatch, useSelector } from "react-redux";
import { setRecon, updateCurrentSession } from "@/store/user.slice";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "react-query";
import { initiateNetcatSession } from "@/services/copilot.service";
import { updateSessions } from "@/store/user.slice";
import { FiMonitor } from "react-icons/fi";
import { v4 as uuidv4 } from "uuid";
import { useState } from "react";
import ToDoModal from "../pages/session/sessionId/ToDoModal";

const Sidebar = ({ sessionId }) => {
  const router = useRouter();
  const dispatch = useDispatch();
  const queryClient = useQueryClient();

  const [showTodo, setShowTodo] = useState(false);

  const { sessions, status, readyToConnect } = useSelector(
    (state) => state.user
  );

  const handleClickTab = (id) => {
    dispatch(updateCurrentSession(id));

    // redirect to which ever tab is selected
    const selectedSession = sessions.filter((s) => s.id === id);
    if (selectedSession.length > 0) {
      const session = selectedSession[0];
      if (session.type === "netcat") {
        router.push(`/session/${sessionId}/netcat/${id}`);
      } else if (session.type === "terminal") {
        router.push(`/session/${sessionId}/terminal/${id}`);
      } else {
        router.push(`/session/${id}`);
      }
    }
  };

  const initiateNetcatListenerMutation = useMutation(initiateNetcatSession, {
    onSuccess: async (data) => {
      message.success(data?.message ?? "Netcat initiated successfully!");
      const netcatId = data.netcatId;

      await queryClient.invalidateQueries(["get-session-data", sessionId]);
      await queryClient.invalidateQueries([
        "get-session-loop-history",
        sessionId,
      ]);

      let updatedSess = [...sessions];

      const exists = updatedSess.find((session) => session.id === netcatId);

      updatedSess = updatedSess.map((s) => {
        return { ...s, is_active: false };
      });

      if (!exists) {
        updatedSess.push({
          id: netcatId,
          is_main: false,
          is_active: true,
          type: "netcat",
        });

        dispatch(updateSessions(updatedSess));
      }

      // open a netcat sidebar tab
      router.push(`/session/${sessionId}/netcat/${netcatId}`);
    },
    onError: (error) => {
      console.log(error);
      notification.error({
        message: "Error",
        description:
          error?.response?.data?.message ?? "Failed to initiate netcat!",
      });
    },
  });

  const handleCreateNetcatSession = async () => {
    await initiateNetcatListenerMutation.mutateAsync({
      session_id: sessionId,
      access: "direct",
    });
  };

  const createTerminalSession = async () => {
    const terminalId = uuidv4();

    let updatedSess = [...sessions];

    const exists = updatedSess.find((session) => session.id === terminalId);

    updatedSess = updatedSess.map((s) => {
      return { ...s, is_active: false };
    });

    if (!exists) {
      updatedSess.push({
        id: terminalId,
        is_main: false,
        is_active: false,
        type: "terminal",
      });

      dispatch(updateSessions(updatedSess));
    }

    router.push(`/session/${sessionId}/terminal/${terminalId}`);
  };

  const items = [
    {
      label: (
        <div
          style={{ display: "flex", gap: "0.6rem" }}
          onClick={handleCreateNetcatSession}
        >
          <Image src={netcat} width={18} height={18} alt="i" />
          Netcat Session
        </div>
      ),
      key: "1",
    },
    {
      label: (
        <div
          style={{ display: "flex", gap: "0.6rem" }}
          onClick={createTerminalSession}
        >
          <Image src={terminal} width={18} height={18} alt="i" />
          Terminal
        </div>
      ),
      key: "2",
    },
  ];

  return (
    <Col span={4}>
      <div className={styles.sidebar}>
        <div className={styles.createNew}>
          <div
            className={styles.exitSession}
            // onClick={async () => await stopTaskMutation.mutateAsync()}
            onClick={() => {
              dispatch(setRecon(false));
              router.push("/dashboard");
            }}
          >
            <AiOutlineDoubleLeft />
            Exit Workspace
          </div>
          <Dropdown
            overlayClassName={styles.processDropdown}
            menu={{ items }}
            trigger={["click"]}
            disabled={status !== "running"}
          >
            <PrimaryButton style={{ width: "100%" }}>
              <PlusOutlined /> New Process
            </PrimaryButton>
          </Dropdown>
          <div className={styles.sessionOptions}>
            {sessions
              .filter((s) => s.is_main && s.type === "session")
              .map((sess) => (
                <div
                  key={sess.id}
                  onClick={() => handleClickTab(sess.id)}
                  className={sess?.is_active ? styles.activeTab : styles.tab}
                >
                  <Image src={quad} width={16} height={16} alt="" />
                  Main Workspace
                </div>
              ))}

            {/* sub sessions */}
            {sessions
              .filter((s) => !s.is_main && s.type === "session")
              .map((sess, i) => (
                <div
                  key={sess.id}
                  onClick={() => handleClickTab(sess.id)}
                  className={sess?.is_active ? styles.activeTab : styles.tab}
                >
                  <Image src={rect} width={16} height={16} alt="" />
                  Sub Workspace {i + 1}
                </div>
              ))}

            {/* netcat sessions */}
            {sessions
              .filter((s) => s.type === "netcat")
              .map((sess, i) => (
                <div
                  key={sess.id}
                  onClick={() => handleClickTab(sess.id)}
                  className={sess?.is_active ? styles.activeTab : styles.tab}
                  style={
                    status === "running" && readyToConnect
                      ? {}
                      : { opacity: 0.5, cursor: "not-allowed" }
                  }
                >
                  <Image src={netcat} width={16} height={16} alt="" />
                  Netcat {i + 1}
                </div>
              ))}

            {/* terminal sessions */}
            {sessions
              .filter((s) => s.type === "terminal")
              .map((sess, i) => (
                <div
                  key={sess.id}
                  onClick={() => handleClickTab(sess.id)}
                  className={sess?.is_active ? styles.activeTab : styles.tab}
                  style={
                    status === "running" && readyToConnect
                      ? {}
                      : { opacity: 0.5, cursor: "not-allowed" }
                  }
                >
                  <Image src={terminal} width={16} height={16} alt="" />
                  Terminal Workspace {i + 1}
                </div>
              ))}

            {/* vpn session */}
            {sessions
              .filter((s) => s.type === "vpn")
              .map((sess) => (
                <Tooltip
                  key={sess.id}
                  title="VPN"
                  placement="right"
                  color="#000"
                >
                  <div
                    key={sess.id}
                    onClick={() =>
                      status === "running" ? handleClickTab(sess.id) : null
                    }
                    className={sess?.is_active ? styles.activeTab : styles.tab}
                    style={
                      status === "running" && readyToConnect
                        ? {}
                        : { opacity: 0.5, cursor: "not-allowed" }
                    }
                  >
                    <Image src={vpn} width={16} height={16} alt="" />
                    VPN
                  </div>
                </Tooltip>
              ))}

            {/* gui session */}
            {sessions
              .filter((s) => s.type === "gui")
              .map((sess) => (
                <Tooltip
                  key={sess.id}
                  title="GUI"
                  placement="right"
                  color="#000"
                >
                  <div
                    key={sess.id}
                    onClick={() =>
                      status === "running" ? handleClickTab(sess.id) : null
                    }
                    className={sess?.is_active ? styles.activeTab : styles.tab}
                    style={
                      status === "running" && readyToConnect
                        ? {}
                        : { opacity: 0.5, cursor: "not-allowed" }
                    }
                  >
                    <FiMonitor />
                    GUI
                  </div>
                </Tooltip>
              ))}

            {/* <div className={styles.tab}>
              <Image src={terminal} width={16} height={16} alt="" />
              Command Line
            </div> */}
          </div>
        </div>

        <div className={styles.additionalOptions}>
          <div className={styles.supportStep}>
            <div className={styles.options} onClick={() => setShowTodo(true)}>
              <Image src={todo} width={16} height={16} alt="i" />
              Todo List
            </div>
            {/* <div className={styles.options}>
              <Image src={findstep} width={16} height={16} alt="i" />
              Find the step
            </div> */}
          </div>
          <div className={styles.helpOptions}>
            <div
              className={styles.options}
              onClick={() => {
                window.open("https://copilot-docs.bugbase.ai/", "_blank");
              }}
            >
              <Image src={docs} width={16} height={16} alt="i" />
              Documentation
            </div>
            <div
              className={styles.options}
              onClick={() => {
                window.open("https://forms.gle/7nB4HbRVRMCYHqmy6", "_blank");
              }}
            >
              <Image src={help} width={16} height={16} alt="i" />
              Share Feedback
            </div>
          </div>
        </div>

        <ToDoModal
          show={showTodo}
          setShow={setShowTodo}
          session_id={sessionId}
        />
      </div>
    </Col>
  );
};

export default Sidebar;
