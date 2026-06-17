import { useMemo } from "react";
import { App, Tooltip } from "antd";
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
import { HiOutlineChevronLeft } from "react-icons/hi";
import {
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ThunderboltFilled,
  TrophyOutlined,
} from "@ant-design/icons";
import { useAgentStreamStore } from "@/store/agentStream.store";
import ContextUsageIndicator from "@/components/agent/ContextUsageIndicator";

const EMPTY_RACERS = [];

function deriveRacers(swarms) {
  if (!swarms || swarms.length === 0) return EMPTY_RACERS;
  const activeSwarms = swarms.filter((sw) => sw.status === "running");
  const display = activeSwarms.length > 0
    ? activeSwarms
    : [swarms[swarms.length - 1]];
  const seen = new Map();
  for (const sw of display) {
    for (const a of sw.agents || []) {
      seen.set(a.agentId, {
        agentId: a.agentId,
        status: a.status,
        model: a.model,
        isWinner: sw.winner === a.agentId,
        tokenUsage: a.tokenUsage ?? null,
      });
    }
  }
  return Array.from(seen.values());
}

function racerFingerprint(swarms) {
  if (!swarms || swarms.length === 0) return "";
  const activeSwarms = swarms.filter((sw) => sw.status === "running");
  const display = activeSwarms.length > 0
    ? activeSwarms
    : [swarms[swarms.length - 1]];
  const parts = [];
  for (const sw of display) {
    for (const a of sw.agents || []) {
      const tu = a.tokenUsage;
      parts.push(
        `${a.agentId}:${a.status}:${a.model || ""}:${sw.winner === a.agentId ? 1 : 0}:${tu ? `${tu.totalTokens},${tu.iteration},${tu.maxIterations}` : ""}`
      );
    }
  }
  return parts.join("|");
}

const RACER_STATUS = {
  running: { icon: <LoadingOutlined spin style={{ fontSize: 8 }} />, color: "#58a6ff" },
  completed: { icon: <CheckCircleOutlined style={{ fontSize: 8 }} />, color: "#7ee787" },
  failed: { icon: <CloseCircleOutlined style={{ fontSize: 8 }} />, color: "#f85149" },
  cancelled: { icon: <CloseCircleOutlined style={{ fontSize: 8 }} />, color: "#d29922" },
  timed_out: { icon: <CloseCircleOutlined style={{ fontSize: 8 }} />, color: "#d29922" },
};

const Sidebar = ({ sessionId, workspaceId }) => {
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
  const orchestratorTokenUsage = useAgentStreamStore(
    (state) => state.sessions[sessionId]?.tokenUsage ?? null,
  );

  const racerFp = useAgentStreamStore(
    (state) => racerFingerprint(state.sessions[sessionId]?.swarms),
  );
  const swarmsRef = useAgentStreamStore.getState().sessions[sessionId]?.swarms;
  const allRacers = useMemo(() => deriveRacers(swarmsRef), [racerFp]);
  const activeRacerCount = useMemo(
    () => allRacers.filter((a) => a.status === "running").length,
    [allRacers],
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

  const navigateToCaido = () => {
    const caidoId = `${sessionId}/caido`;
    let updatedSess = [...sessions];
    const exists = updatedSess.find((s) => s.id === caidoId);
    if (!exists) {
      updatedSess = updatedSess.map((s) => ({ ...s, is_active: false }));
      updatedSess.push({ id: caidoId, is_main: false, is_active: true, type: "caido" });
      dispatch(updateSessions(updatedSess));
    }
    router.push(`/session/${sessionId}/caido`);
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

  const exitTarget = workspaceId
    ? `/workspace/${workspaceId}`
    : "/dashboard";

  const isOnWorkspace = pathname === `/session/${sessionId}`;
  const isOnVPN = pathname?.includes("/vpn");
  const isOnGUI = pathname?.includes("/gui");
  const isOnBurp = pathname?.includes("/burp");
  const isOnCaido = pathname?.includes("/caido");
  const isOnBrowserAgent = pathname?.includes("/browser-agent");
  const activeRacerPath = pathname?.match(/\/racer\/([^/]+)/)?.[1] ?? null;
  const activeRacerTokenUsage = useMemo(() => {
    if (!activeRacerPath) return null;
    return allRacers.find((a) => a.agentId === activeRacerPath)?.tokenUsage ?? null;
  }, [activeRacerPath, allRacers]);
  const contextUsageForTab = activeRacerTokenUsage || orchestratorTokenUsage;

  return (
    <div className={styles.sidebar}>
      <div className={styles.createNew}>
        <div className={styles.navRow}>
          <Tooltip title="All workspaces" placement="right">
            <button
              className={styles.navBtn}
              onClick={() => { dispatch(setRecon(false)); router.push("/dashboard"); }}
            >
              <HiOutlineChevronLeft size={12} />
            </button>
          </Tooltip>
          <button
            className={styles.navLabel}
            onClick={() => { dispatch(setRecon(false)); router.push(exitTarget); }}
          >
            {workspaceId ? "Workspace" : "Dashboard"}
          </button>
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
            Orchestrator
          </div>

          {allRacers.length > 0 && (
            <div className={styles.racerSection}>
              <div className={styles.racerHeader}>
                <ThunderboltFilled style={{ color: "#f0c000", fontSize: 10 }} />
                <span>Racers</span>
                <span className={styles.racerBadge}>
                  {activeRacerCount > 0
                    ? `${activeRacerCount}/${allRacers.length}`
                    : `${allRacers.length}`}
                </span>
              </div>
              {allRacers.map((racer) => {
                const cfg = RACER_STATUS[racer.status] || RACER_STATUS.running;
                const isActive = activeRacerPath === racer.agentId;
                return (
                  <div
                    key={racer.agentId}
                    onClick={() => router.push(`/session/${sessionId}/racer/${racer.agentId}`)}
                    className={isActive ? styles.activeTab : styles.tab}
                    style={{ paddingLeft: "1.5rem" }}
                  >
                    {racer.isWinner ? (
                      <TrophyOutlined style={{ fontSize: 10, color: "#f0c000", flexShrink: 0 }} />
                    ) : (
                      <span style={{
                        display: "inline-flex", alignItems: "center",
                        width: 10, height: 10, borderRadius: "50%",
                        backgroundColor: `${cfg.color}22`,
                        border: `1px solid ${cfg.color}`,
                        justifyContent: "center", flexShrink: 0,
                      }}>
                        {cfg.icon}
                      </span>
                    )}
                    <span style={{
                      overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap", flex: 1,
                      color: racer.isWinner ? "#f0c000" : cfg.color,
                    }}>
                      {racer.model || racer.agentId?.slice(0, 8)}
                    </span>
                    {racer.isWinner && (
                      <span style={{
                        fontSize: "0.55rem", color: "#f0c000",
                        padding: "0 3px", borderRadius: 3,
                        backgroundColor: "#f0c00015",
                        fontWeight: 600,
                      }}>
                        Winner
                      </span>
                    )}
                    {racer.status === "failed" && !racer.isWinner && (
                      <span style={{
                        fontSize: "0.55rem", color: "#f85149",
                        padding: "0 3px", borderRadius: 3,
                        backgroundColor: "#f8514915",
                      }}>
                        Failed
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

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
            onClick={navigateToCaido}
            className={isOnCaido ? styles.activeTab : styles.tab}
          >
            <TbRadar />
            Caido
          </div>

          <div
            onClick={navigateToBrowserAgent}
            className={isOnBrowserAgent ? styles.activeTab : styles.tab}
          >
            <TbWorldWww />
            Browser Agent
          </div>
        </div>
      </div>

      <div className={styles.additionalOptions}>
        {contextUsageForTab && <ContextUsageIndicator tokenUsage={contextUsageForTab} />}
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
                    queryClient.invalidateQueries(["session-info", sessionId]);
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
