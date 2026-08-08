"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Input, Spin, message } from "antd";
import { useQuery, useMutation } from "react-query";
import {
  getMythicConnectionStatus,
  getMythicCallbacks,
  getMythicCallbackTasks,
  getMythicTask,
  createMythicTask,
  getMythicPorts,
  getMythicPayloads,
  getMythicC2Profiles,
  getMythicCredentials,
  getMythicFiles,
} from "@/services/mythic.service";
import styles from "@/styles/components/Mythic.module.scss";

const REFRESH_MS = 5_000;

const INTEGRITY = {
  0: { label: "unknown", tone: "neutral" },
  1: { label: "low", tone: "neutral" },
  2: { label: "medium", tone: "neutral" },
  3: { label: "high", tone: "elevated" },
  4: { label: "SYSTEM", tone: "system" },
};

const VIEWS = [
  { key: "callbacks", label: "Callbacks" },
  { key: "pivots", label: "Pivots" },
  { key: "payloads", label: "Payloads" },
  { key: "listeners", label: "Listeners" },
  { key: "credentials", label: "Credentials" },
  { key: "files", label: "Files" },
];

function principal(cb) {
  return [cb?.domain, cb?.user].filter(Boolean).join("\\") || "unknown";
}

/** Seconds since the beacon last phoned home — the defining fact of a C2 session. */
function secondsSince(value) {
  if (!value) return null;
  // Mythic timestamps are UTC but not always suffixed; normalize so the browser
  // doesn't read them as local time and report a check-in hours in the future.
  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`;
  const then = new Date(normalized).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.round((Date.now() - then) / 1000));
}

function elapsed(seconds) {
  if (seconds == null) return "never";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

/** Beacon health, derived from the agent's own sleep interval where it reports one. */
function beaconState(cb) {
  const seconds = secondsSince(cb?.last_checkin);
  if (cb?.active === false) return { key: "dead", label: "dead", seconds };
  if (seconds == null) return { key: "dead", label: "no check-in", seconds };

  let expected = 60;
  const match = /(\d+)/.exec(cb?.sleep_info || "");
  if (match) expected = Math.max(5, Number(match[1]));

  if (seconds <= expected * 2) return { key: "live", label: "live", seconds };
  if (seconds <= expected * 10) return { key: "late", label: "late", seconds };
  return { key: "stale", label: "stale", seconds };
}

function statusTone(status) {
  const value = String(status || "").toLowerCase();
  if (value.includes("error")) return "error";
  if (value.includes("complet") || value.includes("success")) return "done";
  if (value.includes("process") || value.includes("submitted")) return "running";
  return "neutral";
}

function CopyLine({ value, label }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      message.error("Could not copy to clipboard");
    }
  }, [value]);

  return (
    <button type="button" className={styles.copyLine} onClick={copy} title="Copy">
      <code>{value}</code>
      <span className={styles.copyHint}>{copied ? "copied" : label || "copy"}</span>
    </button>
  );
}

const MythicC2Page = ({ sessionId }) => {
  const [view, setView] = useState("callbacks");
  const [selected, setSelected] = useState(null);
  const [openTask, setOpenTask] = useState(null);
  const [command, setCommand] = useState("");
  const [params, setParams] = useState("");
  // Re-render on a timer so the elapsed check-in counters keep ticking between fetches.
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useQuery(
    ["mythic-connection-status", sessionId],
    getMythicConnectionStatus,
    { refetchInterval: REFRESH_MS },
  );

  const connected = !!status?.connected;
  const configured = !!status?.configured;

  const { data: callbackData, refetch: refetchCallbacks } = useQuery(
    ["mythic-callbacks", sessionId],
    () => getMythicCallbacks({}),
    { enabled: connected, refetchInterval: REFRESH_MS },
  );
  const callbacks = useMemo(() => callbackData?.callbacks ?? [], [callbackData]);

  const { data: portData } = useQuery(["mythic-ports", sessionId], () => getMythicPorts({}), {
    enabled: connected,
    refetchInterval: REFRESH_MS,
  });
  const ports = useMemo(() => portData?.ports ?? [], [portData]);

  const { data: taskData, refetch: refetchTasks } = useQuery(
    ["mythic-callback-tasks", sessionId, selected],
    () => getMythicCallbackTasks(selected, { limit: 50 }),
    { enabled: connected && selected != null, refetchInterval: REFRESH_MS },
  );
  const tasks = useMemo(() => taskData?.tasks ?? [], [taskData]);

  const { data: taskDetail, isLoading: taskLoading } = useQuery(
    ["mythic-task", sessionId, openTask],
    () => getMythicTask(openTask),
    { enabled: connected && openTask != null, refetchInterval: REFRESH_MS },
  );

  const { data: payloadData } = useQuery(["mythic-payloads", sessionId], getMythicPayloads, {
    enabled: connected && view === "payloads",
    refetchInterval: REFRESH_MS,
  });
  const { data: profileData } = useQuery(["mythic-c2-profiles", sessionId], getMythicC2Profiles, {
    enabled: connected && view === "listeners",
  });
  const { data: credentialData } = useQuery(["mythic-credentials", sessionId], getMythicCredentials, {
    enabled: connected && view === "credentials",
    refetchInterval: REFRESH_MS,
  });
  const { data: fileData } = useQuery(["mythic-files", sessionId], () => getMythicFiles({}), {
    enabled: connected && view === "files",
    refetchInterval: REFRESH_MS,
  });

  const taskMutation = useMutation(createMythicTask, {
    onSuccess: (result) => {
      message.success(`Task ${result.taskDisplayId} sent`);
      setOpenTask(result.taskDisplayId);
      setCommand("");
      setParams("");
      refetchTasks();
    },
    onError: (err) => message.error(err?.response?.data?.message || "Could not send the task"),
  });

  const sendTask = useCallback(() => {
    if (selected == null) return message.warning("Pick a callback first");
    if (!command.trim()) return message.warning("Enter a command");
    taskMutation.mutate({ callbackDisplayId: selected, command: command.trim(), params });
  }, [selected, command, params, taskMutation]);

  const mythicHost = useMemo(() => {
    try {
      return new URL(status?.url || "").hostname;
    } catch {
      return status?.url || "";
    }
  }, [status]);

  const selectedCallback = useMemo(
    () => callbacks.find((cb) => cb.display_id === selected) || null,
    [callbacks, selected],
  );

  const socksFor = useCallback(
    (displayId) => ports.find((p) => p.callback?.display_id === displayId && p.port_type === "socks"),
    [ports],
  );

  const metrics = useMemo(() => {
    const live = callbacks.filter((cb) => beaconState(cb).key === "live").length;
    const elevatedCount = callbacks.filter((cb) => (cb.integrity_level ?? 0) >= 3).length;
    return { live, elevated: elevatedCount, pivots: ports.length, hosts: new Set(callbacks.map((c) => c.host)).size };
  }, [callbacks, ports]);

  if (statusLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.centerState}><Spin /></div>
      </div>
    );
  }

  if (!configured || !connected) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Command &amp; control</span>
            <h1>Mythic C2</h1>
            <p>Post-exploitation, pivoting and loot — held in your Mythic server.</p>
          </div>
        </header>
        <div className={styles.emptyCard}>
          <h2>{configured ? "Can’t reach Mythic" : "No Mythic server connected"}</h2>
          <p>
            {configured
              ? status?.error ||
                "Mythic is configured but not answering. Check the server is running and the URL is reachable from Pentest Copilot."
              : "Add your Mythic server URL and API token in Settings → Mythic C2 to manage implants from here."}
          </p>
          <button type="button" className={styles.primaryBtn} onClick={() => refetchStatus()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Command &amp; control</span>
          <h1>Mythic C2</h1>
          <p>
            {status?.operation ? <strong>{status.operation}</strong> : "Connected"}
            <span className={styles.dotSep} />
            <code>{status?.url}</code>
          </p>
        </div>
        <div className={styles.headerActions}>
          <span className={`${styles.pill} ${styles.pillLive}`}>
            <i className={styles.pulse} />
            connected
          </span>
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={() => {
              refetchStatus();
              refetchCallbacks();
              refetchTasks();
            }}
          >
            Refresh
          </button>
        </div>
      </header>

      <section className={styles.metrics}>
        <div className={styles.metric}>
          <span>Live beacons</span>
          <strong className={metrics.live ? styles.valueLive : undefined}>{metrics.live}</strong>
        </div>
        <div className={styles.metric}>
          <span>Callbacks</span>
          <strong>{callbacks.length}</strong>
        </div>
        <div className={styles.metric}>
          <span>Elevated</span>
          <strong className={metrics.elevated ? styles.valueElevated : undefined}>{metrics.elevated}</strong>
        </div>
        <div className={styles.metric}>
          <span>Open pivots</span>
          <strong className={metrics.pivots ? styles.valuePivot : undefined}>{metrics.pivots}</strong>
        </div>
      </section>

      <nav className={styles.segmented} aria-label="Mythic views">
        {VIEWS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={view === item.key ? styles.segActive : styles.seg}
            onClick={() => setView(item.key)}
          >
            {item.label}
            {item.key === "callbacks" && callbacks.length > 0 && (
              <span className={styles.segCount}>{callbacks.length}</span>
            )}
            {item.key === "pivots" && ports.length > 0 && <span className={styles.segCount}>{ports.length}</span>}
          </button>
        ))}
      </nav>

      {view === "callbacks" && (
        <section className={styles.split}>
          <div className={styles.column}>
            {callbacks.length === 0 ? (
              <div className={styles.emptyCard}>
                <h2>Nothing has called back yet</h2>
                <p>
                  Build a payload under <strong>Payloads</strong>, run it on a target, and the implant
                  appears here the moment it checks in.
                </p>
              </div>
            ) : (
              <ul className={styles.callbackList}>
                {callbacks.map((cb) => {
                  const beacon = beaconState(cb);
                  const integrity = INTEGRITY[cb.integrity_level] || INTEGRITY[0];
                  const socks = socksFor(cb.display_id);
                  return (
                    <li key={cb.display_id}>
                      <button
                        type="button"
                        className={cb.display_id === selected ? styles.callbackActive : styles.callback}
                        onClick={() => {
                          setSelected(cb.display_id);
                          setOpenTask(null);
                        }}
                      >
                        <span className={styles.cbId}>{cb.display_id}</span>
                        <span className={styles.cbBody}>
                          <span className={styles.cbTop}>
                            <span className={styles.cbHost}>{cb.host || "unknown-host"}</span>
                            <span className={`${styles.chip} ${styles[`tone_${integrity.tone}`]}`}>
                              {integrity.label}
                            </span>
                          </span>
                          <span className={styles.cbUser}>{principal(cb)}</span>
                          <span className={styles.cbMeta}>
                            <span>{cb.payload?.payloadtype?.name || "agent"}</span>
                            <span className={styles.dotSep} />
                            <span>{cb.os || "?"}</span>
                            {cb.pid ? (
                              <>
                                <span className={styles.dotSep} />
                                <span>pid {cb.pid}</span>
                              </>
                            ) : null}
                            {socks ? (
                              <>
                                <span className={styles.dotSep} />
                                <span className={styles.cbPivot}>socks :{socks.local_port}</span>
                              </>
                            ) : null}
                          </span>
                        </span>
                        <span className={`${styles.beacon} ${styles[`beacon_${beacon.key}`]}`}>
                          <i className={styles.pulse} />
                          {elapsed(beacon.seconds)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className={styles.column}>
            {!selectedCallback ? (
              <div className={styles.emptyCard}>
                <h2>Pick a callback</h2>
                <p>Select an implant to run commands and read results.</p>
              </div>
            ) : (
              <>
                <div className={styles.panel}>
                  <div className={styles.panelHead}>
                    <h3>
                      Run on <code>{selectedCallback.host}</code>
                    </h3>
                    <span className={styles.panelNote}>{principal(selectedCallback)}</span>
                  </div>
                  <div className={styles.console}>
                    <Input
                      placeholder="command"
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      onPressEnter={sendTask}
                      className={styles.cmdInput}
                    />
                    <Input
                      placeholder="parameters (or JSON)"
                      value={params}
                      onChange={(e) => setParams(e.target.value)}
                      onPressEnter={sendTask}
                    />
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      onClick={sendTask}
                      disabled={taskMutation.isLoading}
                    >
                      {taskMutation.isLoading ? "Sending…" : "Send"}
                    </button>
                  </div>
                  <p className={styles.hint}>
                    Runs through Mythic exactly as if typed in its own console — your agent sees these too.
                  </p>
                </div>

                {socksFor(selected) && (
                  <div className={styles.panel}>
                    <div className={styles.panelHead}>
                      <h3>Pivot open</h3>
                    </div>
                    <CopyLine
                      value={`socks5 ${mythicHost} ${socksFor(selected).local_port}`}
                      label="copy for proxychains"
                    />
                  </div>
                )}

                <div className={styles.panel}>
                  <div className={styles.panelHead}>
                    <h3>Tasks</h3>
                    <span className={styles.panelNote}>{tasks.length}</span>
                  </div>
                  {tasks.length === 0 ? (
                    <p className={styles.hint}>Nothing run on this callback yet.</p>
                  ) : (
                    <ul className={styles.taskList}>
                      {tasks.map((t) => (
                        <li key={t.display_id}>
                          <button
                            type="button"
                            className={t.display_id === openTask ? styles.taskActive : styles.task}
                            onClick={() => setOpenTask(t.display_id)}
                          >
                            <span className={styles.taskId}>{t.display_id}</span>
                            <code className={styles.taskCmd}>
                              {t.command_name} {t.display_params || ""}
                            </code>
                            <span className={`${styles.chip} ${styles[`st_${statusTone(t.status)}`]}`}>
                              {t.status || "?"}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className={`${styles.panel} ${styles.outputPanel}`}>
                  <div className={styles.panelHead}>
                    <h3>Output</h3>
                    {openTask != null && <span className={styles.panelNote}>task {openTask}</span>}
                  </div>
                  {openTask == null ? (
                    <p className={styles.hint}>Pick a task to read its output.</p>
                  ) : taskLoading ? (
                    <div className={styles.centerState}><Spin size="small" /></div>
                  ) : (
                    <pre className={styles.output}>{taskDetail?.output || "No output yet."}</pre>
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {view === "pivots" && (
        <section className={styles.panel}>
          {ports.length === 0 ? (
            <div className={styles.inlineEmpty}>
              <h2>No pivots open</h2>
              <p>
                Start a SOCKS proxy on a callback to route <code>nxc</code>, <code>bloodhound-python</code>{" "}
                and <code>nmap</code> into the target network.
              </p>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Callback</th>
                  <th>Host</th>
                  <th>Use</th>
                </tr>
              </thead>
              <tbody>
                {ports.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className={`${styles.chip} ${p.port_type === "socks" ? styles.tone_pivot : styles.tone_neutral}`}>
                        {p.port_type}
                      </span>
                    </td>
                    <td className={styles.mono}>{p.callback?.display_id ?? "—"}</td>
                    <td className={styles.mono}>{p.callback?.host || "—"}</td>
                    <td>
                      {p.port_type === "socks" ? (
                        <CopyLine value={`socks5 ${mythicHost} ${p.local_port}`} label="copy" />
                      ) : (
                        <code className={styles.mono}>
                          target :{p.remote_port ?? "?"} → {p.remote_ip || "?"}:{p.local_port ?? "?"}
                        </code>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className={styles.footnote}>
            SOCKS listeners bind on the Mythic server ({mythicHost}), not on your work host.
          </p>
        </section>
      )}

      {view === "payloads" && (
        <section className={styles.panel}>
          <SimpleTable
            rows={payloadData?.payloads ?? []}
            empty={{ title: "No payloads built", body: "Build one in Mythic, then stage it on a target." }}
            columns={[
              { key: "id", head: "ID", mono: true },
              { key: "type", head: "Agent", render: (r) => r.payloadtype?.name || "—" },
              { key: "os", head: "OS", render: (r) => r.os || "—" },
              {
                key: "build",
                head: "Build",
                render: (r) => (
                  <span className={`${styles.chip} ${r.build_phase === "success" ? styles.st_done : styles.st_neutral}`}>
                    {r.build_phase || "?"}
                  </span>
                ),
              },
              { key: "file", head: "File", mono: true, render: (r) => r.filemetum?.filename_text || "—" },
            ]}
          />
        </section>
      )}

      {view === "listeners" && (
        <section className={styles.panel}>
          <SimpleTable
            rows={profileData?.profiles ?? []}
            empty={{ title: "No C2 profiles", body: "Install one with mythic-cli on your server." }}
            columns={[
              { key: "name", head: "Profile", mono: true, render: (r) => r.name },
              {
                key: "container",
                head: "Container",
                render: (r) => (
                  <span className={`${styles.chip} ${r.container_running ? styles.st_done : styles.st_neutral}`}>
                    {r.container_running ? "running" : "stopped"}
                  </span>
                ),
              },
              {
                key: "running",
                head: "Profile",
                render: (r) => (
                  <span className={`${styles.chip} ${r.running ? styles.st_done : styles.st_neutral}`}>
                    {r.running ? "running" : "stopped"}
                  </span>
                ),
              },
              { key: "desc", head: "Description", render: (r) => r.description || "—" },
            ]}
          />
        </section>
      )}

      {view === "credentials" && (
        <section className={styles.panel}>
          <SimpleTable
            rows={credentialData?.credentials ?? []}
            empty={{ title: "No credentials yet", body: "Harvested credentials land here as the engagement runs." }}
            columns={[
              { key: "realm", head: "Realm", mono: true, render: (r) => r.realm || "—" },
              { key: "account", head: "Account", mono: true, render: (r) => r.account || "—" },
              { key: "type", head: "Type", render: (r) => <span className={styles.chip}>{r.type || "?"}</span> },
              { key: "value", head: "Credential", mono: true, render: (r) => r.credential_text || "—" },
              { key: "comment", head: "Source", render: (r) => r.comment || "—" },
            ]}
          />
        </section>
      )}

      {view === "files" && (
        <section className={styles.panel}>
          <SimpleTable
            rows={fileData?.files ?? []}
            empty={{ title: "No files", body: "Files pulled from or pushed to targets show up here." }}
            columns={[
              { key: "dir", head: "", render: (r) => (r.is_download_from_agent ? "↓" : "↑") },
              { key: "name", head: "Filename", mono: true, render: (r) => r.filename_text || "—" },
              { key: "path", head: "Remote path", mono: true, render: (r) => r.full_remote_path_text || "—" },
              { key: "host", head: "Host", mono: true, render: (r) => r.task?.callback?.host || "—" },
              {
                key: "complete",
                head: "State",
                render: (r) => (
                  <span className={`${styles.chip} ${r.complete ? styles.st_done : styles.st_running}`}>
                    {r.complete ? "complete" : "transferring"}
                  </span>
                ),
              },
            ]}
          />
        </section>
      )}
    </div>
  );
};

function SimpleTable({ rows, columns, empty }) {
  if (!rows.length) {
    return (
      <div className={styles.inlineEmpty}>
        <h2>{empty.title}</h2>
        <p>{empty.body}</p>
      </div>
    );
  }
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key}>{c.head}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => (
          <tr key={row.id ?? idx}>
            {columns.map((c) => (
              <td key={c.key} className={c.mono ? styles.mono : undefined}>
                {c.render ? c.render(row) : row[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default MythicC2Page;
