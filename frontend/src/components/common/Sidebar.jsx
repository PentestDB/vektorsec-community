import { useMemo, useState, useEffect } from "react";
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
import Link from "next/link";
import { getMenuItems } from "@/services/menu.service";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { getCapabilities, updateCapabilities } from "@/services/user.service";
import { clearContext, getVulnerabilities } from "@/services/agent.service";
import AgentToolsPanel from "@/components/session/AgentToolsPanel";
import { updateSessions } from "@/store/user.slice";
import { FiMonitor, FiShield, FiLock, FiLink } from "react-icons/fi";
import { MdOutlineDeleteSweep } from "react-icons/md";
import { TbPlugConnected, TbRadar, TbTopologyStar3, TbWorldWww } from "react-icons/tb";
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
import FeedbackModal from "@/components/common/FeedbackModal";
import { useTranslation } from "@/i18n/I18nProvider";

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

// Admin-managed session-page navigation tabs. URLs use a {sessionId}
// placeholder substituted at render time. The same list is seeded into the DB
// on first run so admins can manage these from the Admin Panel. Used as the
// fallback when the menu API is unreachable.
const DEFAULT_SESSION_MENUS = [
  {
    labelKey: "session.orchestrator",
    url: "/session/{sessionId}",
    order: -1,
  },
  {
    labelKey: "session.vulnerabilities",
    url: "/session/{sessionId}/vulnerabilities",
    order: 0,
  },
  {
    labelKey: "session.connection",
    url: "/session/{sessionId}/connection",
    order: 1,
  },
  { labelKey: "session.vpn", url: "/session/{sessionId}/vpn", order: 2, locked: true },
  { labelKey: "session.gui", url: "/session/{sessionId}/gui", order: 3, locked: true },
  { labelKey: "session.burp", url: "/session/{sessionId}/burp", order: 4, locked: true },
  { labelKey: "session.caido", url: "/session/{sessionId}/caido", order: 5, locked: true },
  {
    labelKey: "session.mythicC2",
    url: "/session/{sessionId}/mythic",
    order: 6,
  },
  {
    labelKey: "session.browser",
    url: "/session/{sessionId}/browser-agent",
    order: 7,
  },
];

/**
 * Resolve a menu label: built-in menus carry an i18n `labelKey`, admin-created
 * menus carry a plain `label` that is shown verbatim.
 */
function menuLabel(menu, t) {
  return menu?.labelKey ? t(menu.labelKey) : menu?.label;
}

/** A session menu item whose URL is the base chat page (e.g. Orchestrator). */
function isChatMenuUrl(url) {
  return String(url || "").replace(/\/+$/, "") === "/session/{sessionId}";
}

/**
 * Substitute the active session id and classify the route so the sidebar can
 * keep its special behaviors (lock icons, Pro-plan tooltips, badges, redux
 * navigation handlers).
 */
function resolveSessionNavUrl(m, sessionId) {
  const raw = String(m.url || "");
  const url =
    raw.replaceAll("{sessionId}", sessionId) || `/session/${sessionId}`;
  let kind = "link";
  if (isChatMenuUrl(raw)) kind = "chat";
  else if (url.endsWith("/vulnerabilities")) kind = "vulnerabilities";
  else if (url.endsWith("/vpn")) kind = "vpn";
  else if (url.endsWith("/gui")) kind = "gui";
  else if (url.endsWith("/burp")) kind = "burp";
  else if (url.endsWith("/caido")) kind = "caido";
  else if (url.endsWith("/browser-agent")) kind = "browser-agent";
  return { url, kind };
}

const Sidebar = ({ sessionId, workspaceId }) => {
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useDispatch();
  const queryClient = useQueryClient();
  const { modal, message } = App.useApp();
  const { t } = useTranslation();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [customMenus, setCustomMenus] = useState([]);
  const [sessionMenus, setSessionMenus] = useState([]);

  // Admin-managed menu links (Content → Menu Links) shown in the sidebar.
  useEffect(() => {
    let cancelled = false;
    getMenuItems("all")
      .then((data) => {
        if (!cancelled)
          setCustomMenus(
            Array.isArray(data?.menus)
              ? data.menus.filter((m) => m.placement !== "session")
              : []
          );
      })
      .catch(() => {
        // Not configured — no custom links.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Admin-managed session navigation tabs (Content → Menu Links → Session
  // Sidebar). Falls back to the built-in defaults when empty/unreachable.
  useEffect(() => {
    let cancelled = false;
    getMenuItems("session")
      .then((data) => {
        if (!cancelled)
          setSessionMenus(Array.isArray(data?.menus) ? data.menus : []);
      })
      .catch(() => {
        // Falls back to DEFAULT_SESSION_MENUS.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { data: capabilitiesData } = useQuery("capabilities", getCapabilities);
  const { data: vulnerabilitiesData } = useQuery(
    ["vulnerabilities", sessionId],
    () => getVulnerabilities(sessionId),
    { enabled: !!sessionId, refetchInterval: 5000, retry: false },
  );
  const toolExecutionMode = capabilitiesData?.toolExecutionMode ??
    (capabilitiesData?.requireConsentForAllTools ? "requires_consent" : "auto");

  const updateCapabilitiesMutation = useMutation(updateCapabilities, {
    onSuccess: () => {
      queryClient.invalidateQueries("capabilities");
    },
    onError: () => {
      message.error("Failed to update tool execution mode");
    },
  });

  const handleExecutionModeChange = (mode) => {
    updateCapabilitiesMutation.mutate({
      toolExecutionMode: mode,
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

  const navigateToMythic = () => {
    const mythicId = `${sessionId}/mythic`;
    let updatedSess = [...sessions];
    const exists = updatedSess.find((s) => s.id === mythicId);
    if (!exists) {
      updatedSess = updatedSess.map((s) => ({ ...s, is_active: false }));
      updatedSess.push({ id: mythicId, is_main: false, is_active: true, type: "mythic" });
      dispatch(updateSessions(updatedSess));
    }
    router.push(`/session/${sessionId}/mythic`);
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
  const isOnMythic = pathname?.includes("/mythic");
  const isOnBrowserAgent = pathname?.includes("/browser-agent");
  const isOnVulnerabilities = pathname?.includes("/vulnerabilities");
  const isOnConnection = pathname?.includes("/connection");
  const activeRacerPath = pathname?.match(/\/racer\/([^/]+)/)?.[1] ?? null;
  const activeRacerTokenUsage = useMemo(() => {
    if (!activeRacerPath) return null;
    return allRacers.find((a) => a.agentId === activeRacerPath)?.tokenUsage ?? null;
  }, [activeRacerPath, allRacers]);
  const contextUsageForTab = activeRacerTokenUsage || orchestratorTokenUsage;

  // Session navigation tabs come from the admin-managed menus (placement
  // "session"). When the DB has none (or the API is unreachable) we fall back
  // to the built-in defaults so the sidebar keeps working.
  const chatMenu = sessionMenus.find((m) => isChatMenuUrl(m.url));
  const sessionNavItems =
    sessionMenus.length > 0
      ? sessionMenus
          .filter((m) => !isChatMenuUrl(m.url))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      : DEFAULT_SESSION_MENUS;

  const renderSessionNavItem = (m) => {
    const { url, kind } = resolveSessionNavUrl(m, sessionId);
    const isActive =
      kind === "chat"
        ? isOnWorkspace
        : kind === "vulnerabilities"
        ? isOnVulnerabilities
        : kind === "vpn"
        ? isOnVPN
        : kind === "gui"
        ? isOnGUI
        : kind === "burp"
        ? isOnBurp
        : kind === "caido"
        ? isOnCaido
        : kind === "browser-agent"
        ? isOnBrowserAgent
        : pathname === url || pathname?.startsWith(`${url}/`);
    const handleClick = () => {
      if (kind === "vpn") return navigateToVPN();
      if (kind === "gui") return navigateToGUI();
      if (kind === "burp") return navigateToBurp();
      if (kind === "caido") return navigateToCaido();
      if (kind === "browser-agent") return navigateToBrowserAgent();
      router.push(url);
    };
    const icon =
      kind === "vulnerabilities" ? (
        <FiShield />
      ) : kind === "gui" ? (
        <FiMonitor />
      ) : kind === "burp" || kind === "caido" ? (
        <TbRadar />
      ) : kind === "browser-agent" ? (
        <TbWorldWww />
      ) : kind === "vpn" ? (
        <Image src={vpn} width={14} height={14} alt="" />
      ) : (
        <FiLink />
      );
    const tabContent = (
      <div
        onClick={handleClick}
        className={isActive ? styles.activeTab : styles.tab}
      >
        {icon}
        <span style={{ flex: 1 }}>{menuLabel(m, t)}</span>
        {kind === "vulnerabilities" && (vulnerabilitiesData?.total ?? 0) > 0 && (
          <span className={styles.navBadge}>{vulnerabilitiesData.total}</span>
        )}
        {m.locked && <FiLock className={styles.lockIcon} size={12} />}
      </div>
    );
    const key = m._id || url;
    return m.locked ? (
      <Tooltip key={key} title={t("session.proLockTooltip")} placement="right">
        {tabContent}
      </Tooltip>
    ) : (
      <div key={key}>{tabContent}</div>
    );
  };

  return (
    <div className={styles.sidebar}>
      <div className={styles.createNew}>
        <div className={styles.navRow}>
          <Tooltip title={t("session.allWorkspaces")} placement="right">
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
            {workspaceId ? t("session.workspace") : t("nav.dashboard")}
          </button>
        </div>

        <Tooltip
          placement="right"
          title={toolExecutionMode === "auto"
            ? t("session.toolModeAutoHint")
            : toolExecutionMode === "auto_approve"
              ? t("session.toolModeAutoApproveHint")
              : t("session.toolModeConsentHint")}
        >
        <div
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
            cursor: "default",
            userSelect: "none",
            transition: "all 0.15s",
          }}
        >
          <FiShield size={12} style={{ flexShrink: 0 }} />
          <select
            aria-label={t("session.toolExecutionMode")}
            value={toolExecutionMode}
            disabled={updateCapabilitiesMutation.isLoading}
            onChange={(event) => handleExecutionModeChange(event.target.value)}
            style={{
              minWidth: 0,
              width: "100%",
              color: "var(--primary-text)",
              background: "transparent",
              border: 0,
              outline: 0,
              cursor: "pointer",
              fontSize: "0.72rem",
            }}
          >
            <option value="auto">{t("session.toolModeAuto")}</option>
            <option value="auto_approve">{t("session.toolModeAutoApprove")}</option>
            <option value="requires_consent">{t("session.toolModeConsent")}</option>
          </select>
        </div>
        </Tooltip>

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
                {t("session.mainWorkspace")}
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
                {t("session.subWorkspace", { index: i + 1 })}
              </div>
            ))}

          {(chatMenu || sessionMenus.length === 0) && (
            <div
              onClick={() => router.push(`/session/${sessionId}`)}
              className={isOnWorkspace ? styles.activeTab : styles.tab}
            >
              <Image src={quad} width={14} height={14} alt="" />
              {chatMenu ? menuLabel(chatMenu, t) : t("session.orchestrator")}
            </div>
          )}

          {allRacers.length > 0 && (
            <div className={styles.racerSection}>
              <div className={styles.racerHeader}>
                <ThunderboltFilled style={{ color: "#f0c000", fontSize: 10 }} />
                <span>{t("session.racers")}</span>
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
                        {t("session.winner")}
                      </span>
                    )}
                    {racer.status === "failed" && !racer.isWinner && (
                      <span style={{
                        fontSize: "0.55rem", color: "#f85149",
                        padding: "0 3px", borderRadius: 3,
                        backgroundColor: "#f8514915",
                      }}>
                        {t("session.failed")}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {sessionNavItems.map((m) => renderSessionNavItem(m))}
        </div>
      </div>

      {customMenus.length > 0 && (
        <div
          style={{
            padding: "0.5rem 0.75rem",
            borderTop: "1px solid var(--border-subtle)",
          }}
        >
          <div
            style={{
              fontSize: "0.65rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--secondary-text)",
              marginBottom: "0.35rem",
            }}
          >
            {t("session.quickLinks")}
          </div>
          {customMenus.map((m) =>
            m.openInNewTab ? (
              <a
                key={m._id}
                href={m.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "block",
                  padding: "0.35rem 0.25rem",
                  fontSize: "0.78rem",
                  color: "var(--secondary-text)",
                  textDecoration: "none",
                }}
              >
                {menuLabel(m, t)}
              </a>
            ) : (
              <Link
                key={m._id}
                href={m.url}
                style={{
                  display: "block",
                  padding: "0.35rem 0.25rem",
                  fontSize: "0.78rem",
                  color: "var(--secondary-text)",
                  textDecoration: "none",
                }}
              >
                {menuLabel(m, t)}
              </Link>
            )
          )}
        </div>
      )}

      <div className={styles.additionalOptions}>
        {contextUsageForTab && <ContextUsageIndicator tokenUsage={contextUsageForTab} />}
        <div className={styles.supportStep}>
          <div
            className={styles.options}
            onClick={() => {
              modal.confirm({
                title: t("session.clearContextTitle"),
                content: t("session.clearContextBody"),
                okText: t("session.clearContextOk"),
                okType: "danger",
                cancelText: t("common.cancel"),
                centered: true,
                async onOk() {
                  try {
                    await clearContext({ sessionId });
                    message.success(t("session.clearedOk"));
                    window.dispatchEvent(new CustomEvent("context-cleared", { detail: { sessionId } }));
                    queryClient.invalidateQueries(["session-info", sessionId]);
                  } catch {
                    message.error(t("session.clearFailed"));
                  }
                },
              });
            }}
          >
            <MdOutlineDeleteSweep size={15} />
            {t("session.clearContext")}
          </div>
          <div className={styles.options}>
            <Image src={docs} width={14} height={14} alt="" />
            {t("session.documentation")}
          </div>
          <div
            className={styles.options}
            onClick={() => setFeedbackOpen(true)}
          >
            <Image src={help} width={14} height={14} alt="" />
            {t("session.shareFeedback")}
          </div>
        </div>
      </div>

      <FeedbackModal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
      />
    </div>
  );
};

export default Sidebar;
