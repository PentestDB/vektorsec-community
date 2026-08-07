import path from "path";
import { ToolDefinition } from "../types";
import {
  MYTHIC_NOT_CONFIGURED_MSG,
  addCredential,
  describeMythicError,
  downloadFile,
  getCallback,
  getCredentials,
  getFileBrowserTree,
  getFiles,
  isMythicConfigured,
  issueTask,
  uploadFileToMythic,
  writeBufferToWorkHost,
} from "../../services/mythic.client";
import { formatCredentials, formatFiles, formatTree } from "../../utils/mythicFormat";

const CREDENTIAL_TYPES = ["plaintext", "certificate", "hash", "key", "ticket", "cookie"];

const mythicLoot: ToolDefinition = {
  name: "mythic_loot",
  description:
    "Work with the loot Mythic has collected: the unified file browser, downloaded files, files staged onto " +
    "targets, and the credential store. Use this to pull a file off a compromised host onto the work host for " +
    "offline cracking or parsing, to push a tool onto a target, and to record credentials harvested during the " +
    "engagement. " +
    "Operates against the operator's Mythic server; all C2 session data remains in Mythic, this tool only issues API calls.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["browse", "list_files", "download_file", "upload_file", "list_credentials", "add_credential"],
        description:
          '"browse" reads the file browser tree Mythic has built; "list_files" shows files Mythic holds; ' +
          '"download_file" saves one to the work host; "upload_file" pushes a work-host file onto a target; ' +
          '"list_credentials"/"add_credential" manage the credential store.',
      },
      host: {
        type: "string",
        description: 'For "browse": limit the tree to one host.',
      },
      path_prefix: {
        type: "string",
        description: 'For "browse": only show paths starting with this prefix, e.g. "C:\\\\Users".',
      },
      callback_display_id: {
        type: "number",
        description: 'For "list_files": limit to one callback. For "upload_file": the target callback (required).',
      },
      agent_file_id: {
        type: "string",
        description: 'For "download_file": the agent_file_id from "list_files".',
      },
      save_path: {
        type: "string",
        description: 'For "download_file": absolute path on the work host to write to.',
      },
      local_path: {
        type: "string",
        description: 'For "upload_file": absolute path on the work host of the file to push.',
      },
      remote_path: {
        type: "string",
        description: 'For "upload_file": where to write the file on the target host.',
      },
      credential_type: {
        type: "string",
        enum: CREDENTIAL_TYPES,
        description: 'For "add_credential": the kind of credential material.',
      },
      account: {
        type: "string",
        description: 'For "add_credential": the account name.',
      },
      realm: {
        type: "string",
        description: 'For "add_credential": the domain or realm the credential is valid in.',
      },
      credential: {
        type: "string",
        description: 'For "add_credential": the secret itself (password, hash, ticket…).',
      },
      comment: {
        type: "string",
        description: 'For "add_credential": where it came from, e.g. "secretsdump on DC01".',
      },
      limit: {
        type: "number",
        description: "How many rows to return for list actions.",
      },
    },
    required: ["action"],
  },
  // Reading loot and pulling files down to the work host are free. Writing a file onto
  // a target host is an irreversible change to the client's estate, so it is hard-gated.
  timeoutMs: 180_000,
  shouldRequireConsent(args) {
    return String(args?.action || "") === "upload_file";
  },
  async execute(args, ctx) {
    if (!isMythicConfigured()) {
      return { output: `Error: ${MYTHIC_NOT_CONFIGURED_MSG}`, exitCode: 1 };
    }

    const action = String(args.action || "");
    const limit = typeof args.limit === "number" ? args.limit : undefined;

    try {
      if (action === "browse") {
        const nodes = await getFileBrowserTree({
          host: typeof args.host === "string" ? args.host : undefined,
          pathPrefix: typeof args.path_prefix === "string" ? args.path_prefix : undefined,
          limit,
        });
        return { output: formatTree(nodes), exitCode: 0 };
      }

      if (action === "list_files") {
        const files = await getFiles({
          callbackDisplayId: Number.isInteger(Number(args.callback_display_id))
            ? Number(args.callback_display_id)
            : undefined,
          limit,
        });
        return { output: formatFiles(files), exitCode: 0 };
      }

      if (action === "download_file") {
        const agentFileId = String(args.agent_file_id || "");
        const savePath = String(args.save_path || "");
        if (!agentFileId) {
          return { output: 'Error: agent_file_id is required for action "download_file".', exitCode: 1 };
        }
        if (!savePath.startsWith("/")) {
          return { output: 'Error: save_path must be an absolute path on the work host.', exitCode: 1 };
        }

        const buffer = await downloadFile(agentFileId);
        const { bytes, output } = await writeBufferToWorkHost(buffer, savePath, ctx.runCommand);
        if (bytes !== buffer.length) {
          return { output: `Downloaded ${buffer.length} bytes from Mythic but ${output}`, exitCode: 1 };
        }
        return { output, exitCode: 0, files: [savePath] };
      }

      if (action === "upload_file") {
        const callbackDisplayId = Number(args.callback_display_id);
        const localPath = String(args.local_path || "");
        const remotePath = String(args.remote_path || "");
        if (!Number.isInteger(callbackDisplayId)) {
          return { output: 'Error: callback_display_id is required for action "upload_file".', exitCode: 1 };
        }
        if (!localPath.startsWith("/")) {
          return { output: "Error: local_path must be an absolute path on the work host.", exitCode: 1 };
        }
        if (!remotePath) {
          return { output: 'Error: remote_path is required for action "upload_file".', exitCode: 1 };
        }

        const callback = await getCallback(callbackDisplayId);
        if (!callback) {
          return { output: `No callback with display id ${callbackDisplayId} exists in Mythic.`, exitCode: 1 };
        }

        // Read the file off the work host (local or SSH) rather than the backend container.
        const read = await ctx.runCommand(`base64 -w0 ${JSON.stringify(localPath)}`, 120_000);
        if (read.exitCode !== 0) {
          return { output: `Could not read ${localPath} on the work host:\n${read.output}`, exitCode: 1 };
        }
        const content = Buffer.from(read.output.trim(), "base64");
        if (!content.length) {
          return { output: `${localPath} is empty or could not be read.`, exitCode: 1 };
        }

        const fileId = await uploadFileToMythic({ filename: path.basename(localPath), content });
        const { taskDisplayId } = await issueTask({
          callbackDisplayId,
          command: "upload",
          params: JSON.stringify({ file: fileId, remote_path: remotePath }),
        });

        return {
          output:
            `Registered ${localPath} (${content.length} bytes) with Mythic as ${fileId} and tasked callback ` +
            `${callbackDisplayId} (${callback.host || "?"}) to write it to ${remotePath}.\n` +
            `Check progress with mythic_task action "output" and task_display_id ${taskDisplayId}.`,
          exitCode: 0,
        };
      }

      if (action === "list_credentials") {
        const creds = await getCredentials(limit ?? 50);
        return { output: formatCredentials(creds), exitCode: 0 };
      }

      if (action === "add_credential") {
        const type = String(args.credential_type || "plaintext");
        const account = String(args.account || "");
        const realm = String(args.realm || "");
        const credential = String(args.credential || "");
        if (!account || !credential) {
          return {
            output: 'Error: account and credential are required for action "add_credential".',
            exitCode: 1,
          };
        }
        if (!CREDENTIAL_TYPES.includes(type)) {
          return {
            output: `Error: credential_type must be one of ${CREDENTIAL_TYPES.join(", ")}.`,
            exitCode: 1,
          };
        }

        const id = await addCredential({
          type,
          account,
          realm,
          credential,
          comment: typeof args.comment === "string" ? args.comment : undefined,
        });

        // Keep the agent's own working memory in step with Mythic's store.
        ctx.engagementState?.credentials.push({
          username: realm ? `${realm}\\${account}` : account,
          secret: credential,
          secretType: type === "plaintext" ? "password" : type === "hash" ? "hash" : "other",
          source: typeof args.comment === "string" && args.comment ? args.comment : "Mythic C2",
          validOn: realm ? [realm] : [],
        });

        return {
          output: `Credential stored in Mythic (id ${id}): ${realm ? `${realm}\\` : ""}${account} [${type}]`,
          exitCode: 0,
        };
      }

      return {
        output:
          `Error: Unknown action "${action}". Use "browse", "list_files", "download_file", "upload_file", ` +
          `"list_credentials" or "add_credential".`,
        exitCode: 1,
      };
    } catch (err) {
      return { output: `Error: ${describeMythicError(err)}`, exitCode: 1 };
    }
  },
};

export default mythicLoot;
