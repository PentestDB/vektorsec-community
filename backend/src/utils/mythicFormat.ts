/**
 * Presentation helpers shared by the Mythic tool handlers.
 * Output is aimed at an LLM: compact, aligned, no ANSI, stable field order.
 */

import type {
  MythicCallback,
  MythicCallbackPort,
  MythicCredential,
  MythicFile,
  MythicPayload,
  MythicTask,
  MythicTreeNode,
} from "../services/mythic.client";

const INTEGRITY_LEVELS: Record<number, string> = {
  0: "unknown",
  1: "low",
  2: "medium",
  3: "high",
  4: "SYSTEM",
};

export function describeIntegrity(level?: number): string {
  if (typeof level !== "number") return "unknown";
  return INTEGRITY_LEVELS[level] || String(level);
}

export function formatCallback(cb: MythicCallback): string {
  const principal = [cb.domain, cb.user].filter(Boolean).join("\\") || "unknown";
  return (
    `[${cb.display_id}] ${cb.host || "unknown-host"}  ${principal}  ` +
    `${cb.os || "?"}/${cb.architecture || "?"}  integrity=${describeIntegrity(cb.integrity_level)}  ` +
    `pid=${cb.pid ?? "?"}${cb.process_name ? `(${cb.process_name})` : ""}  ` +
    `ip=${cb.ip || "?"}  ext=${cb.external_ip || "?"}  ` +
    `agent=${cb.payload?.payloadtype?.name || "?"}  ` +
    `last_checkin=${cb.last_checkin || "?"}` +
    (cb.locked ? "  [LOCKED]" : "") +
    (cb.description ? `\n      note: ${cb.description}` : "")
  );
}

export function formatCallbackList(callbacks: MythicCallback[]): string {
  if (!callbacks.length) {
    return "No callbacks found in Mythic. There is no active foothold to task yet.";
  }
  return (
    `${callbacks.length} callback(s). Use the bracketed number as callback_display_id:\n` +
    callbacks.map((cb) => `  ${formatCallback(cb)}`).join("\n")
  );
}

export function formatTask(task: MythicTask): string {
  return (
    `[task ${task.display_id}] ${task.command_name || "?"} ${task.display_params || ""}`.trimEnd() +
    `  status=${task.status || "?"}  completed=${task.completed ? "yes" : "no"}` +
    (task.callback?.display_id ? `  callback=${task.callback.display_id}` : "") +
    (task.timestamp ? `  at=${task.timestamp}` : "")
  );
}

export function formatTaskList(tasks: MythicTask[]): string {
  if (!tasks.length) return "No tasks found.";
  return tasks.map((t) => `  ${formatTask(t)}`).join("\n");
}

export function formatPorts(ports: MythicCallbackPort[], mythicHost: string): string {
  if (!ports.length) return "No active SOCKS or reverse port forwards.";
  return ports
    .map((p) => {
      if (p.port_type === "rpfwd") {
        return (
          `  [rpfwd] callback=${p.callback?.display_id ?? "?"}  ` +
          `target listens on :${p.remote_port ?? "?"} → forwards to ${p.remote_ip || "?"}:${p.local_port ?? "?"}`
        );
      }
      return (
        `  [socks] callback=${p.callback?.display_id ?? "?"}  ` +
        `proxy at ${mythicHost}:${p.local_port ?? "?"}  ` +
        `(use: proxychains4 -q <tool> — see the note about reachability)`
      );
    })
    .join("\n");
}

export function formatPayloads(payloads: MythicPayload[]): string {
  if (!payloads.length) return "No payloads built in this Mythic operation.";
  return payloads
    .map(
      (p) =>
        `  [${p.id}] ${p.payloadtype?.name || "?"}/${p.os || "?"}  uuid=${p.uuid}  ` +
        `build=${p.build_phase || "?"}  file=${p.filemetum?.filename_text || "?"}` +
        (p.filemetum?.agent_file_id ? `  agent_file_id=${p.filemetum.agent_file_id}` : "") +
        (p.description ? `\n      ${p.description}` : ""),
    )
    .join("\n");
}

export function formatFiles(files: MythicFile[]): string {
  if (!files.length) return "No files recorded in Mythic.";
  return files
    .map((f) => {
      const progress =
        f.complete === false && typeof f.total_chunks === "number"
          ? ` (${f.chunks_received ?? 0}/${f.total_chunks} chunks)`
          : "";
      return (
        `  ${f.is_download_from_agent ? "↓" : "↑"} ${f.filename_text || "?"}${progress}  ` +
        `agent_file_id=${f.agent_file_id}  ` +
        `path=${f.full_remote_path_text || "?"}  ` +
        `host=${f.task?.callback?.host || "?"}  callback=${f.task?.callback?.display_id ?? "?"}`
      );
    })
    .join("\n");
}

export function formatTree(nodes: MythicTreeNode[]): string {
  if (!nodes.length) {
    return "No file browser entries. Task the callback with its file-listing command (e.g. `ls`) first.";
  }
  return nodes
    .map(
      (n) =>
        `  ${n.can_have_children ? "d" : "-"} ${n.full_path_text || n.name_text || "?"}` +
        (n.host ? `  (host: ${n.host})` : "") +
        (n.success === false ? "  [access denied]" : ""),
    )
    .join("\n");
}

export function formatCredentials(creds: MythicCredential[]): string {
  if (!creds.length) return "No credentials stored in this Mythic operation.";
  return creds
    .map(
      (c) =>
        `  [${c.id}] ${c.realm || "-"}\\${c.account || "-"}  type=${c.type || "?"}  ` +
        `value=${c.credential_text || ""}` +
        (c.comment ? `  (${c.comment})` : ""),
    )
    .join("\n");
}

/** Truncate long implant output while making the truncation obvious. */
export function clampOutput(text: string, max = 10_000): string {
  if (!text) return "(no output)";
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n… [truncated ${text.length - max} more characters — fetch the rest with action "output"]`;
}
