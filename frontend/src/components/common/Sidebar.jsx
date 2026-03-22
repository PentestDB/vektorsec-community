import { App } from "antd";
import { AiOutlineDoubleLeft } from "react-icons/ai";
import styles from "@/styles/pages/Session.module.scss";
import Image from "next/image";
import vpn from "@/assets/sidebar/vpn.svg";
import quad from "@/assets/sidebar/quad.svg";
import docs from "@/assets/sidebar/docs.svg";
import help from "@/assets/sidebar/help.svg";
import rect from "@/assets/sidebar/rect.svg";
import { useDispatch, useSelector } from "react-redux";
import { setRecon, updateCurrentSession } from "@/store/user.slice";
import { useRouter, usePathname } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { getCapabilities, updateCapabilities } from "@/services/user.service";
import { clearContext } from "@/services/agent.service";
import AgentToolsPanel from "@/components/session/AgentToolsPanel";
import { updateSessions } from "@/store/user.slice";
import { FiMonitor } from "react-icons/fi";
import { MdOutlineDeleteSweep } from "react-icons/md";
import { TbRadar, TbWorldWww } from "react-icons/tb";
import { FaFlag } from "react-icons/fa";
import { useAgentStreamStore } from "@/store/agentStream.store";
import ContextUsageIndicator from "@/components/agent/ContextUsageIndicator";

const Sidebar = ({ sessionId }) => {
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useDispatch();
  const queryClient = useQueryClient();
  const { modal, message } = App.useApp();

  const { data: capabilitiesData } = useQuery("capabilities", getCapabilities);
  const requireConsent = capabilitiesData?.requireConsentForAllTools ?? false;

  const updateCapabilitiesMutation = useMutation(updateCapabilities, {
    onSuccess: () => {
      queryClient.invalidateQueries("capabilities");
    },
    onError: () => {
      message.error("Failed to update tool execution mode");
    },
  });

  const handleToggleConsent = () => {
    updateCapabilitiesMutation.mutate({
      requireConsentForAllTools: !requireConsent,
    });
  };

  const { sessions } = useSelector((state) => state.user);
  const tokenUsage = useAgentStreamStore(
    (state) => state.sessions[sessionId]?.tokenUsage ?? null,
  );

  const handleClickTab = (id) => {
    dispatch(updateCurrentSession(id));
    const selectedSession = sessions.filter((s) => s.id === id);
    if (selectedSession.length > 0) {
      router.push(`/session/${id}`);
    }
  };

  const navigateToVPN = () => {
    const vpnId = `${sessionId}/vpn`;
    let updatedSess = [...sessions];
    const exists = updatedSess.find((s) => s.id === vpnId);
    if (!exists) {
      updatedSess = updatedSess.map((s) => ({ ...s, is_active: false }));
      updatedSess.push({ id: vpnId, is_main: false, is_active: true, type: "vpn" });
      dispatch(updateSessions(updatedSess));
    }
    router.push(`/session/${sessionId}/vpn`);
  };

  const navigateToGUI = () => {
    const guiId = `${sessionId}/gui`;
    let updatedSess = [...sessions];
    const exists = updatedSess.find((s) => s.id === guiId);
    if (!exists) {
      updatedSess = updatedSess.map((s) => ({ ...s, is_active: false }));
      updatedSess.push({ id: guiId, is_main: false, is_active: true, type: "gui" });
      dispatch(updateSessions(updatedSess));
    }
    router.push(`/session/${sessionId}/gui`);
  };

  const navigateToBurp = () => {
    const burpId = `${sessionId}/burp`;
    let updatedSess = [...sessions];
    const exists = updatedSess.find((s) => s.id === burpId);
    if (!exists) {
      updatedSess = updatedSess.map((s) => ({ ...s, is_active: false }));
      updatedSess.push({ id: burpId, is_main: false, is_active: true, type: "burp" });
      dispatch(updateSessions(updatedSess));
    }
    router.push(`/session/${sessionId}/burp`);
  };

  const navigateToBrowserAgent = () => {
    const baId = `${sessionId}/browser-agent`;
    let updatedSess = [...sessions];
    const exists = updatedSess.find((s) => s.id === baId);
    if (!exists) {
      updatedSess = updatedSess.map((s) => ({ ...s, is_active: false }));
      updatedSess.push({ id: baId, is_main: false, is_active: true, type: "browser-agent" });
      dispatch(updateSessions(updatedSess));
    }
    router.push(`/session/${sessionId}/browser-agent`);
  };

  const navigateToCtf = () => {
    const ctfId = `${sessionId}/ctf`;
    let updatedSess = [...sessions];
    const exists = updatedSess.find((s) => s.id === ctfId);
    if (!exists) {
      updatedSess = updatedSess.map((s) => ({ ...s, is_active: false }));
      updatedSess.push({ id: ctfId, is_main: false, is_active: true, type: "ctf" });
      dispatch(updateSessions(updatedSess));
    }
    router.push(`/session/${sessionId}/ctf`);
  };

  const isOnWorkspace = pathname === `/session/${sessionId}`;
  const isOnVPN = pathname?.includes("/vpn");
  const isOnGUI = pathname?.includes("/gui");
  const isOnBurp = pathname?.includes("/burp");
  const isOnBrowserAgent = pathname?.includes("/browser-agent");
  const isOnCtf = pathname?.includes("/ctf");

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

        <div
          onClick={handleToggleConsent}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.45rem 0.75rem",
            marginBottom: "0.5rem",
            fontSize: "0.72rem",
            fontWeight: 500,
            color: "var(--secondary-text)",
            background: "var(--secondary-bg)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 6,
            cursor: "pointer",
            userSelect: "none",
            transition: "all 0.15s",
          }}
        >
          <span style={{ whiteSpace: "nowrap" }}>
            {requireConsent ? "Ask consent" : "Auto run"}
          </span>
          <div style={{
            width: 28,
            height: 14,
            borderRadius: 7,
            backgroundColor: requireConsent ? "#d29922" : "#7ee787",
            position: "relative",
            transition: "background-color 0.2s",
            flexShrink: 0,
          }}>
            <div style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: "#fff",
              position: "absolute",
              top: 2,
              left: requireConsent ? 16 : 2,
              transition: "left 0.2s",
            }} />
          </div>
        </div>

        <AgentToolsPanel sessionId={sessionId} />

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

          <div
            onClick={() => router.push(`/session/${sessionId}`)}
            className={isOnWorkspace ? styles.activeTab : styles.tab}
          >
            <Image src={quad} width={14} height={14} alt="" />
            Workspace
          </div>

          <div
            onClick={navigateToVPN}
            className={isOnVPN ? styles.activeTab : styles.tab}
          >
            <Image src={vpn} width={14} height={14} alt="" />
            VPN
          </div>

          <div
            onClick={navigateToGUI}
            className={isOnGUI ? styles.activeTab : styles.tab}
          >
            <FiMonitor />
            GUI
          </div>

          <div
            onClick={navigateToBurp}
            className={isOnBurp ? styles.activeTab : styles.tab}
          >
            <TbRadar />
            Burp
          </div>

          <div
            onClick={navigateToBrowserAgent}
            className={isOnBrowserAgent ? styles.activeTab : styles.tab}
          >
            <TbWorldWww />
            Browser Agent
          </div>

          <div
            onClick={navigateToCtf}
            className={isOnCtf ? styles.activeTab : styles.tab}
          >
            <FaFlag />
            CTF
          </div>
        </div>
      </div>

      <div className={styles.additionalOptions}>
        {tokenUsage && <ContextUsageIndicator tokenUsage={tokenUsage} />}
        <div className={styles.supportStep}>
          <div
            className={styles.options}
            onClick={() => {
              modal.confirm({
                title: "Clear context?",
                content: "This will erase all conversation history for this session. The system prompt and shells will be preserved.",
                okText: "Clear",
                okType: "danger",
                cancelText: "Cancel",
                centered: true,
                async onOk() {
                  try {
                    await clearContext({ sessionId });
                    message.success("Context cleared");
                    window.dispatchEvent(new CustomEvent("context-cleared", { detail: { sessionId } }));
                  } catch {
                    message.error("Failed to clear context");
                  }
                },
              });
            }}
          >
            <MdOutlineDeleteSweep size={15} />
            Clear Context
          </div>
          <div
            className={styles.options}
            onClick={() => window.open("https://github.com/bugbasesecurity/pentest-copilot/wiki", "_blank")}
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

    </div>
  );
};

export default Sidebar;
