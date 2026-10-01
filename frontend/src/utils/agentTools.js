/**
 * Agent tool presentation metadata + pure grouping helpers.
 *
 * The backend is the single source of truth for *which* tools exist
 * (`GET /api/agent/session/:id/agent-tools-config` returns every registered
 * tool with `{ name, description, enabled, configured }`). This module only
 * adds presentation metadata (group order, human labels) and — crucially —
 * makes sure **no tool is ever hidden** when new tools are registered on the
 * backend: anything without metadata falls into the "Other tools" group.
 */

/** Ordered groups shown in the panel. `label`/`description` are presentation only. */
export const TOOL_GROUP_META = [
  { id: "core", label: "Core", description: "Shell and scripting" },
  { id: "recon", label: "Recon & Scanning", description: "Port, service, content and vulnerability scanning" },
  { id: "web", label: "Web Proxies", description: "Burp Suite and Caido workflows" },
  { id: "c2", label: "Mythic C2", description: "Callbacks, tasking, pivoting, loot" },
  { id: "browser", label: "Browser", description: "Magnitude browser automation" },
  { id: "oob", label: "Out-of-Band", description: "Blind vulnerability detection" },
  { id: "intelligence", label: "Intelligence", description: "Search, knowledge, reasoning, delegation" },
  { id: "engagement", label: "Engagement", description: "Findings, evidence, reporting and state" },
  { id: "ctf", label: "CTF", description: "CTF event helpers" },
  { id: "other", label: "Other tools", description: "Registered tools without a curated label" },
];

/** Fallback group id used for tools that have no entry in TOOL_META. */
export const OTHER_GROUP_ID = "other";

/**
 * Curated tool -> presentation metadata. Keep this in sync with
 * `backend/src/tools/registry.ts`; missing entries are still shown (grouped
 * under "Other tools") so the UI never silently drops a tool.
 */
export const TOOL_META = {
  // ── Core ────────────────────────────────────────────────────────────
  run_bash: { group: "core", label: "Run Bash" },
  run_python_script: { group: "core", label: "Run Python" },
  run_install_tool: { group: "core", label: "Install Tool" },
  run_security_tool: { group: "core", label: "Run Security Tool" },
  spawn_shell: { group: "core", label: "Spawn Shell" },
  write_to_shell: { group: "core", label: "Write to Shell" },
  read_shell: { group: "core", label: "Read Shell" },
  list_shells: { group: "core", label: "List Shells" },
  close_shell: { group: "core", label: "Close Shell" },
  netcat_listener: { group: "core", label: "Netcat Listener" },
  view_image: { group: "core", label: "View Image" },

  // ── Recon & Scanning ───────────────────────────────────────────────
  nmap_scan: { group: "recon", label: "Nmap Scan" },
  naabu_scan: { group: "recon", label: "Naabu Scan" },
  nuclei_scan: { group: "recon", label: "Nuclei Scan" },
  ffuf_fuzz: { group: "recon", label: "ffuf Fuzz" },
  gobuster_fuzz: { group: "recon", label: "Gobuster Fuzz" },

  // ── Web proxies ────────────────────────────────────────────────────
  search_burp_proxy_history: { group: "web", label: "Burp Proxy History" },
  send_to_burp_repeater: { group: "web", label: "Burp Repeater" },
  send_to_burp_intruder: { group: "web", label: "Burp Intruder" },
  burp_collaborator: { group: "web", label: "Burp Collaborator" },
  burp_proxy_control: { group: "web", label: "Burp Proxy Control" },
  search_caido_http_history: { group: "web", label: "Caido HTTP History" },
  send_to_caido_replay: { group: "web", label: "Caido Replay" },
  send_to_caido_automate: { group: "web", label: "Caido Automate" },
  caido_intercept_control: { group: "web", label: "Caido Intercept" },
  caido_oast: { group: "web", label: "Caido OAST" },

  // ── Mythic C2 ──────────────────────────────────────────────────────
  mythic_callbacks: { group: "c2", label: "Callbacks" },
  mythic_task: { group: "c2", label: "Task Implant" },
  mythic_task_results: { group: "c2", label: "Task Output" },
  mythic_pivot: { group: "c2", label: "Pivot (SOCKS/rpfwd)" },
  mythic_payload: { group: "c2", label: "Payloads" },
  mythic_listener: { group: "c2", label: "Listeners" },
  mythic_loot: { group: "c2", label: "Files & Credentials" },
  mythic_graphql: { group: "c2", label: "Raw GraphQL" },

  // ── Browser / OOB ──────────────────────────────────────────────────
  browser_action: { group: "browser", label: "Browser Action" },
  oob_listener: { group: "oob", label: "OOB Listener" },

  // ── Intelligence / delegation ──────────────────────────────────────
  google_search: { group: "intelligence", label: "Google Search" },
  query_knowledge: { group: "intelligence", label: "Query Knowledge Base" },
  ask_user: { group: "intelligence", label: "Ask User" },
  spawn_subagent: { group: "intelligence", label: "Spawn Subagent" },
  spawn_swarm: { group: "intelligence", label: "Spawn Swarm" },
  wait: { group: "intelligence", label: "Wait for Racers" },
  bump_racer: { group: "intelligence", label: "Bump Racer" },
  read_racer_trace: { group: "intelligence", label: "Read Racer Trace" },
  route_model: { group: "intelligence", label: "Route Model" },
  run_async_task: { group: "intelligence", label: "Run Async Task" },
  get_task_status: { group: "intelligence", label: "Task Status" },

  // ── Engagement (findings / evidence / reporting) ───────────────────
  report_finding: { group: "engagement", label: "Report Finding" },
  check_findings: { group: "engagement", label: "Check Findings" },
  collect_evidence: { group: "engagement", label: "Collect Evidence" },
  generate_report: { group: "engagement", label: "Generate Report" },
  track_attack_chain: { group: "engagement", label: "Track Attack Chain" },
  update_engagement_state: { group: "engagement", label: "Update Engagement State" },
  store_target_memory: { group: "engagement", label: "Store Target Memory" },
  vault_manage: { group: "engagement", label: "Vault (Secrets)" },
  audit_log: { group: "engagement", label: "Audit Log" },
  check_scope: { group: "engagement", label: "Check Scope" },
  request_approval: { group: "engagement", label: "Request Approval" },
  approve_command: { group: "engagement", label: "Approve Command" },
  broadcast: { group: "engagement", label: "Broadcast" },

  // ── CTF ────────────────────────────────────────────────────────────
  get_solve_status: { group: "ctf", label: "Solve Status" },
};

/**
 * Build the render model for the tools panel.
 *
 * @param {Array<{name: string, description?: string, enabled?: boolean, configured?: boolean}>} tools
 *        Tools exactly as returned by the backend.
 * @returns {Array<{id: string, label: string, description: string, tools: Array<object>}>}
 *          Groups in display order; empty groups are dropped. Unknown tools end
 *          up in the "Other tools" group so they can still be toggled.
 */
export function buildToolGroups(tools) {
  const list = Array.isArray(tools) ? tools : [];
  const byGroup = new Map();

  for (const tool of list) {
    if (!tool || !tool.name) continue;
    const meta = TOOL_META[tool.name];
    const groupId = meta?.group ?? OTHER_GROUP_ID;
    if (!byGroup.has(groupId)) byGroup.set(groupId, []);
    byGroup.get(groupId).push({
      ...tool,
      label: meta?.label ?? tool.name,
      enabled: tool.enabled !== false,
      configured: tool.configured !== false,
    });
  }

  const groups = [];
  for (const group of TOOL_GROUP_META) {
    const groupTools = byGroup.get(group.id);
    if (!groupTools || groupTools.length === 0) continue;
    groupTools.sort((a, b) => a.label.localeCompare(b.label));
    groups.push({ ...group, tools: groupTools });
  }
  return groups;
}

/** Count the toggleable state of a tool list: `{ enabled, total }`. */
export function countTools(tools) {
  const list = Array.isArray(tools) ? tools : [];
  return {
    total: list.length,
    enabled: list.filter((tool) => tool?.enabled !== false).length,
  };
}

/**
 * Names of the tools currently disabled in a session, i.e. the exact payload
 * the backend expects in `POST .../agent-tools-config`.
 */
export function buildDisabledToolNames(tools) {
  const list = Array.isArray(tools) ? tools : [];
  return list.filter((tool) => tool?.enabled === false).map((tool) => tool.name);
}
