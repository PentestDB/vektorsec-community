import { message, notification } from "antd";
import { AiOutlineDoubleLeft } from "react-icons/ai";
import styles from "@/styles/pages/Session.module.scss";
import Image from "next/image";
import vpn from "@/assets/sidebar/vpn.svg";
import terminal from "@/assets/sidebar/terminal.svg";
import netcat from "@/assets/sidebar/netcat.svg";
import todo from "@/assets/sidebar/todo.svg";
import quad from "@/assets/sidebar/quad.svg";
import docs from "@/assets/sidebar/docs.svg";
import help from "@/assets/sidebar/help.svg";
import rect from "@/assets/sidebar/rect.svg";
import { useDispatch, useSelector } from "react-redux";
import { setRecon, updateCurrentSession } from "@/store/user.slice";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "react-query";
import { initiateNetcatSession } from "@/services/copilot.service";
import { updateSessions } from "@/store/user.slice";
import { updateActiveTerminal } from "@/store/socket.slice";
import { FiMonitor } from "react-icons/fi";
import { TbPlus } from "react-icons/tb";
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
    dispatch(updateActiveTerminal(id));

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

  const isDisabled = status !== "running";

  return (
    <div className={styles.sidebar}>
      <div className={styles.createNew}>
        <div
          className={styles.exitSession}
          onClick={() => {
            dispatch(setRecon(false));
            router.push("/dashboard");
          }}
        >
          <AiOutlineDoubleLeft />
          Exit Workspace
        </div>

        <div className={styles.newProcessGroup}>
          <div
            className={`${styles.newProcessBtn} ${isDisabled ? styles.newProcessBtnDisabled : ""}`}
            onClick={isDisabled ? undefined : createTerminalSession}
          >
            <TbPlus style={{ fontSize: 11 }} />
            Terminal
          </div>
          <div
            className={`${styles.newProcessBtn} ${isDisabled ? styles.newProcessBtnDisabled : ""}`}
            onClick={isDisabled ? undefined : handleCreateNetcatSession}
          >
            <TbPlus style={{ fontSize: 11 }} />
            Listener
          </div>
        </div>

        <div className={styles.sessionOptions}>
          {sessions
            .filter((s) => s.is_main && s.type === "session")
            .map((sess) => (
              <div
                key={sess.id}
                onClick={() => handleClickTab(sess.id)}
                className={sess?.is_active ? styles.activeTab : styles.tab}
              >
                <Image src={quad} width={14} height={14} alt="" />
                Main Workspace
              </div>
            ))}

          {sessions
            .filter((s) => !s.is_main && s.type === "session")
            .map((sess, i) => (
              <div
                key={sess.id}
                onClick={() => handleClickTab(sess.id)}
                className={sess?.is_active ? styles.activeTab : styles.tab}
              >
                <Image src={rect} width={14} height={14} alt="" />
                Sub Workspace {i + 1}
              </div>
            ))}

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
                <Image src={netcat} width={14} height={14} alt="" />
                Netcat {i + 1}
              </div>
            ))}

          {sessions
            .filter((s) => s.type === "terminal" && !s.temporary)
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
                <Image src={terminal} width={14} height={14} alt="" />
                Terminal {i + 1}
              </div>
            ))}

          {sessions
            .filter((s) => s.type === "vpn")
            .map((sess) => (
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
                <Image src={vpn} width={14} height={14} alt="" />
                VPN
              </div>
            ))}

          {sessions
            .filter((s) => s.type === "gui")
            .map((sess) => (
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
            ))}
        </div>
      </div>

      <div className={styles.additionalOptions}>
        <div className={styles.supportStep}>
          <div className={styles.options} onClick={() => setShowTodo(true)}>
            <Image src={todo} width={14} height={14} alt="" />
            Todo List
          </div>
          <div
            className={styles.options}
            onClick={() => window.open("https://copilot-docs.bugbase.ai/", "_blank")}
          >
            <Image src={docs} width={14} height={14} alt="" />
            Documentation
          </div>
          <div
            className={styles.options}
            onClick={() => window.open("https://forms.gle/7nB4HbRVRMCYHqmy6", "_blank")}
          >
            <Image src={help} width={14} height={14} alt="" />
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
  );
};

export default Sidebar;
