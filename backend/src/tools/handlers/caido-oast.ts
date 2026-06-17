import { ToolDefinition } from "../types";
import {
  createCaidoOastSession,
  getCaidoConnection,
  getCaidoOastInteractions,
  getCaidoOastProviders,
  getCaidoOastSessions,
  getCaidoOastStatus,
  installCaidoOastPlugin,
  isCaidoConfigured,
  pollCaidoOastSession,
} from "../../services/caido.client";

function formatProviders(providers: any[]) {
  if (!providers.length) return "No providers configured.";
  return providers
    .map(
      (provider) =>
        `[${provider.id}] ${provider.name} (${provider.kind}) ${provider.enabled ? "enabled" : "disabled"} ${provider.url}`,
    )
    .join("\n");
}

function formatSessions(sessions: any[]) {
  if (!sessions.length) return "No OAST sessions found.";
  return sessions
    .map(
      (session) =>
        `[${session.id}] ${session.status} ${session.url} (${session.interactionCount || 0} interaction(s))`,
    )
    .join("\n");
}

function formatInteractions(interactions: any[]) {
  if (!interactions.length) return "No OAST interactions found.";
  return interactions
    .map((interaction, index) => {
      const remote = interaction.remoteAddress ? ` from ${interaction.remoteAddress}` : "";
      return `[${index + 1}] ${interaction.protocol}${remote} at ${interaction.timestamp}\n` +
        `  Unique ID: ${interaction.uniqueId || "-"}\n` +
        `  Request: ${interaction.rawRequest ? interaction.rawRequest.slice(0, 500) : "(empty)"}`;
    })
    .join("\n\n");
}

const caidoOast: ToolDefinition = {
  name: "caido_oast",
  description:
    "Use the optional OAST plugin for out-of-band testing. Install the plugin, create payload sessions, and poll for interactions.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["status", "install", "providers", "generate", "poll", "interactions", "sessions"],
        description:
          '"install" installs the optional plugin, "generate" creates a payload URL, "poll" checks for new interactions.',
      },
      provider_id: {
        type: "string",
        description: 'Optional provider ID for "generate". Defaults to the first enabled provider.',
      },
      session_id: {
        type: "string",
        description: 'Required for "poll" and "interactions".',
      },
      title: {
        type: "string",
        description: 'Optional session title for "generate".',
      },
    },
    required: ["action"],
  },
  timeoutMs: 60_000,
  async execute(args) {
    const conn = getCaidoConnection();
    if (!isCaidoConfigured(conn)) {
      return {
        output: "Error: integration is not configured. Set CAIDO_URL and CAIDO_PAT in Settings.",
        exitCode: 1,
      };
    }

    try {
      const action = String(args.action || "status");

      if (action === "install") {
        const result = await installCaidoOastPlugin();
        return {
          output:
            `OAST plugin installed: ${result.manifestId}\n` +
            result.plugins
              .map((plugin: any) => `- ${plugin.kind} ${plugin.manifestId}: ${plugin.enabled ? "enabled" : "disabled"}`)
              .join("\n"),
          exitCode: 0,
        };
      }

      if (action === "status") {
        const status = await getCaidoOastStatus();
        if (!status.installed) {
          return {
            output: 'OAST plugin is not installed. Run action "install" first.',
            exitCode: 0,
          };
        }
        return {
          output:
            `OAST plugin installed: ${status.manifestId}\n\n` +
            `Providers:\n${formatProviders(status.providers)}\n\n` +
            `Sessions:\n${formatSessions(status.sessions)}`,
          exitCode: 0,
        };
      }

      if (action === "providers") {
        return { output: formatProviders(await getCaidoOastProviders()), exitCode: 0 };
      }

      if (action === "sessions") {
        return { output: formatSessions(await getCaidoOastSessions()), exitCode: 0 };
      }

      if (action === "generate") {
        const session = await createCaidoOastSession({
          providerId: args.provider_id ? String(args.provider_id) : undefined,
          title: args.title ? String(args.title) : undefined,
        });
        return {
          output:
            `OAST payload generated:\n` +
            `  Payload: ${session.url}\n` +
            `  Session ID: ${session.id}\n` +
            `  Provider ID: ${session.providerId}\n\n` +
            `Inject this payload into requests, then poll with the session ID to check for interactions.`,
          exitCode: 0,
        };
      }

      if (action === "poll" || action === "interactions") {
        if (!args.session_id) {
          return { output: `Error: session_id is required for "${action}".`, exitCode: 1 };
        }
        const interactions =
          action === "poll"
            ? await pollCaidoOastSession(String(args.session_id))
            : await getCaidoOastInteractions(String(args.session_id));
        return { output: formatInteractions(interactions), exitCode: 0 };
      }

      return {
        output: 'Error: action must be status, install, providers, generate, poll, interactions, or sessions.',
        exitCode: 1,
      };
    } catch (err: any) {
      if (/plugin\/backend|internal_server_error|Internal server error|REST request failed/i.test(err.message || "")) {
        return {
          output:
            "Error with OAST plugin backend: the plugin is installed, but its backend returned an internal error. " +
            "Open the local instance, verify the plugin is enabled, and restart/reload the instance if it was just installed. " +
            `Raw error: ${err.message}`,
          exitCode: 1,
        };
      }
      return { output: `Error with OAST integration: ${err.message}`, exitCode: 1 };
    }
  },
};

export default caidoOast;
