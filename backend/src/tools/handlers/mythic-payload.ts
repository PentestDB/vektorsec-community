import { ToolDefinition } from "../types";
import {
  MYTHIC_NOT_CONFIGURED_MSG,
  MythicPayloadSubmitted,
  createPayload,
  describeMythicError,
  downloadFile,
  getPayloadTypes,
  getPayloads,
  isMythicConfigured,
  waitForPayloadBuild,
  writeBufferToWorkHost,
} from "../../services/mythic.client";
import { formatPayloads } from "../../utils/mythicFormat";

const mythicPayload: ToolDefinition = {
  name: "mythic_payload",
  description:
    "List and build Mythic C2 payloads (implants). Use this to discover which agent types the operator's Mythic " +
    "server has installed, build a payload for a target OS, and save the built artifact onto the work host so it " +
    "can be staged onto a compromised machine. " +
    "Operates against the operator's Mythic server; all C2 session data remains in Mythic, this tool only issues API calls.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "list_payload_types", "create", "download"],
        description:
          '"list" shows built payloads; "list_payload_types" shows installed agent types; "create" builds a new ' +
          'payload; "download" saves a built payload to the work host.',
      },
      definition: {
        type: "string",
        description:
          'For "create": the Mythic payload definition as a JSON string — the same object the Mythic UI submits ' +
          'when you click Generate. Must include at least payload_type, selected_os, filename, c2_profiles and ' +
          "build_parameters. Check the Mythic UI for the exact shape your agent expects.",
      },
      agent_file_id: {
        type: "string",
        description: 'For "download": the agent_file_id shown in the "list" output.',
      },
      save_path: {
        type: "string",
        description:
          'For "download": absolute path on the work host to write the payload to, e.g. /tmp/agent.exe. Required.',
      },
      limit: {
        type: "number",
        description: 'For "list": how many payloads to return. Default 25, max 100.',
      },
    },
    required: ["action"],
  },
  // Listing payloads and agent types is free; building and fetching are hard-gated below.
  timeoutMs: 180_000,
  shouldRequireConsent(args) {
    // Building an implant produces a real, deployable binary. Never auto-approve,
    // and never let a racer do it unattended.
    const action = String(args?.action || "");
    return action === "create" || action === "download";
  },
  async execute(args, ctx) {
    if (!isMythicConfigured()) {
      return { output: `Error: ${MYTHIC_NOT_CONFIGURED_MSG}`, exitCode: 1 };
    }

    const action = String(args.action || "");
    try {
      if (action === "list") {
        const payloads = await getPayloads(typeof args.limit === "number" ? args.limit : 25);
        return { output: formatPayloads(payloads), exitCode: 0 };
      }

      if (action === "list_payload_types") {
        const types = await getPayloadTypes();
        if (!types.length) {
          return {
            output: "No payload types installed on this Mythic server. Install an agent with mythic-cli first.",
            exitCode: 0,
          };
        }
        return {
          output:
            "Installed Mythic agent types:\n" +
            types
              .map((t) => `  - ${t.name} (${t.supported_os || "?"})${t.note ? `: ${t.note}` : ""}`)
              .join("\n"),
          exitCode: 0,
        };
      }

      if (action === "create") {
        if (typeof args.definition !== "string" || !args.definition.trim()) {
          return { output: 'Error: definition (a JSON string) is required for action "create".', exitCode: 1 };
        }
        let definition: Record<string, any>;
        try {
          definition = JSON.parse(args.definition);
        } catch (err: any) {
          return { output: `Error: definition is not valid JSON: ${err.message}`, exitCode: 1 };
        }

        // Record what already exists so the new payload can be identified even when
        // Mythic's webhook fails to return a usable uuid.
        const before = new Set((await getPayloads(10)).map((p) => p.id));

        let uuid: string | undefined;
        try {
          uuid = (await createPayload(definition)).uuid;
        } catch (err) {
          if (!(err instanceof MythicPayloadSubmitted)) throw err;
          // Mythic returned a malformed acknowledgement but very likely started the
          // build regardless. Resolve the truth by polling rather than reporting a
          // failure that did not happen.
        }

        const built = await waitForPayloadBuild({ uuid, knownIds: before });
        if (!built) {
          return {
            output:
              "Mythic did not report a payload build. Check the Mythic UI — a queued build may still " +
              'appear shortly under action "list".',
            exitCode: 1,
          };
        }

        if (String(built.build_phase || "").toLowerCase() !== "success") {
          return {
            output:
              `Payload build FAILED (build_phase: ${built.build_phase || "unknown"}).\n` +
              `${built.build_message || "(no build message)"}`,
            exitCode: 1,
          };
        }

        return {
          output:
            `Payload built successfully.\n` +
            `  uuid: ${built.uuid}\n` +
            `  file: ${built.filemetum?.filename_text || "?"}\n` +
            `  agent_file_id: ${built.filemetum?.agent_file_id || "?"}\n` +
            `Download it to the work host with action "download".`,
          exitCode: 0,
        };
      }

      if (action === "download") {
        const agentFileId = String(args.agent_file_id || "");
        const savePath = String(args.save_path || "");
        if (!agentFileId) {
          return { output: 'Error: agent_file_id is required for action "download".', exitCode: 1 };
        }
        if (!savePath.startsWith("/")) {
          return { output: 'Error: save_path must be an absolute path for action "download".', exitCode: 1 };
        }

        const buffer = await downloadFile(agentFileId);
        const { bytes, output } = await writeBufferToWorkHost(buffer, savePath, ctx.runCommand);
        if (bytes !== buffer.length) {
          return { output: `Downloaded ${buffer.length} bytes from Mythic but ${output}`, exitCode: 1 };
        }
        return { output, exitCode: 0, files: [savePath] };
      }

      return {
        output: `Error: Unknown action "${action}". Use "list", "list_payload_types", "create" or "download".`,
        exitCode: 1,
      };
    } catch (err) {
      return { output: `Error: ${describeMythicError(err)}`, exitCode: 1 };
    }
  },
};

export default mythicPayload;
