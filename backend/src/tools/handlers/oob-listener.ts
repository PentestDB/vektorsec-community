import { ToolDefinition } from "../types";
import { readEnvFile } from "../../utils/envWriter";
import {
  buildPayloadUrls,
  createOobPayload,
  isValidOobToken,
  pollOobInteractions,
} from "../../services/oob.service";

function formatInteractions(interactions: any[]): string {
  if (!interactions.length) return "No OOB interactions recorded yet.";
  return interactions
    .map(
      (i, idx) =>
        `[${idx + 1}] ${i.method} ${i.protocol}://${i.host || ""}${i.path}` +
        (i.remoteAddress ? ` from ${i.remoteAddress}` : "") +
        ` at ${new Date(i.timestamp).toISOString()}` +
        (i.bodyPreview ? `\n    Body: ${i.bodyPreview.slice(0, 300)}` : ""),
    )
    .join("\n");
}

const oobListener: ToolDefinition = {
  name: "oob_listener",
  allowedRoles: ["orchestrator", "swarm_agent", "subagent"],
  description:
    "Generate self-hosted out-of-band (OOB) callback payloads and poll for interactions. " +
    "Use this to detect blind vulnerabilities (blind SSRF, blind XXE, blind SQLi, template injection, " +
    "Log4Shell-style lookups) where the target makes an external request. The VektorSec server itself " +
    "receives the callbacks — no external Collaborator/OAST service is required. " +
    "Action 'generate' creates a payload URL and token; action 'poll' with that token returns any HTTP " +
    "interactions the target triggered.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["generate", "poll"],
        description:
          '"generate" creates a payload URL + token, "poll" checks the token for recorded interactions.',
      },
      label: {
        type: "string",
        description:
          'Optional label describing the injection point (e.g. "XXE in /api/import"). Used with "generate".',
      },
      token: {
        type: "string",
        description:
          'Required for "poll". The token returned by a previous "generate" call.',
      },
    },
    required: ["action"],
  },
  timeoutMs: 30_000,
  async execute(args, _ctx) {
    const action = String(args.action || "generate");
    try {
      if (action === "generate") {
        const info = await createOobPayload(
          args.label ? String(args.label) : undefined,
        );
        const env = readEnvFile();
        const base = String(env.OOB_BASE_URL || "").replace(/\/+$/, "");
        const urls = buildPayloadUrls(base, info.token);
        return {
          output:
            `OOB payload generated:\n` +
            `  Token:    ${info.token}\n` +
            `  Path URL: ${urls.pathUrl}\n` +
            `  Host URL: ${urls.hostUrl}  (requires wildcard DNS *.oob → this server)\n` +
            `  Expires:  ${info.expiresAt.toISOString()}\n\n` +
            `Inject the Path URL into the target (SSRF/XXE/SQLi payload), then call ` +
            `oob_listener with action "poll" and token ${info.token} to check for interactions.`,
          exitCode: 0,
        };
      }

      if (action === "poll") {
        const token = String(args.token || "");
        if (!isValidOobToken(token)) {
          return {
            output:
              'Error: a valid "token" from a previous generate call is required for "poll".',
            exitCode: 1,
          };
        }
        const { interactions } = await pollOobInteractions(token);
        return { output: formatInteractions(interactions), exitCode: 0 };
      }

      return {
        output: 'Error: action must be "generate" or "poll".',
        exitCode: 1,
      };
    } catch (err: any) {
      return { output: `Error with OOB listener: ${err.message}`, exitCode: 1 };
    }
  },
};

export default oobListener;
