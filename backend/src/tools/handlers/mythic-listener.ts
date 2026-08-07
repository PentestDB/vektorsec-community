import { ToolDefinition } from "../types";
import {
  MYTHIC_NOT_CONFIGURED_MSG,
  describeMythicError,
  getC2Profiles,
  isMythicConfigured,
  startStopC2Profile,
} from "../../services/mythic.client";

const mythicListener: ToolDefinition = {
  name: "mythic_listener",
  description:
    "Manage the C2 profiles (listeners) on the operator's Mythic server — the channels implants call back over. " +
    "List which profiles are installed and running, and start or stop one. A payload can only be built against a " +
    "profile whose container is running. " +
    "Operates against the operator's Mythic server; all C2 session data remains in Mythic, this tool only issues API calls.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "start", "stop"],
        description: '"list" shows installed C2 profiles and their state; "start"/"stop" control one.',
      },
      profile_name: {
        type: "string",
        description: 'The C2 profile container name, e.g. "http". Required for "start" and "stop".',
      },
    },
    required: ["action"],
  },
  // Listing profiles is free; starting or stopping one is hard-gated below.
  timeoutMs: 120_000,
  shouldRequireConsent(args) {
    // Starting a listener opens a port on the operator's infrastructure.
    return String(args?.action || "") !== "list";
  },
  async execute(args, _ctx) {
    if (!isMythicConfigured()) {
      return { output: `Error: ${MYTHIC_NOT_CONFIGURED_MSG}`, exitCode: 1 };
    }

    const action = String(args.action || "");
    try {
      const profiles = await getC2Profiles();

      if (action === "list") {
        if (!profiles.length) {
          return {
            output: "No C2 profiles installed on this Mythic server. Install one with mythic-cli first.",
            exitCode: 0,
          };
        }
        return {
          output:
            "Mythic C2 profiles:\n" +
            profiles
              .map(
                (p) =>
                  `  - ${p.name}  container=${p.container_running ? "running" : "stopped"}  ` +
                  `profile=${p.running ? "running" : "stopped"}` +
                  (p.description ? `\n      ${p.description}` : ""),
              )
              .join("\n"),
          exitCode: 0,
        };
      }

      if (action === "start" || action === "stop") {
        const name = String(args.profile_name || "").trim();
        if (!name) {
          return { output: `Error: profile_name is required for "${action}".`, exitCode: 1 };
        }
        const profile = profiles.find((p) => p.name.toLowerCase() === name.toLowerCase());
        if (!profile) {
          return {
            output:
              `No C2 profile named "${name}". Installed profiles: ` +
              (profiles.map((p) => p.name).join(", ") || "(none)"),
            exitCode: 1,
          };
        }

        const result = await startStopC2Profile({ id: profile.id, action });
        return {
          output:
            `C2 profile "${profile.name}" ${action === "start" ? "started" : "stopped"} (${result.status}).` +
            (result.output ? `\n${result.output}` : ""),
          exitCode: 0,
        };
      }

      return { output: `Error: Unknown action "${action}". Use "list", "start" or "stop".`, exitCode: 1 };
    } catch (err) {
      return { output: `Error: ${describeMythicError(err)}`, exitCode: 1 };
    }
  },
};

export default mythicListener;
