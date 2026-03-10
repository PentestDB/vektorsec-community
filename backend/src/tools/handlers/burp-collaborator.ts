import { ToolDefinition } from "../types";
import { readEnvFile } from "../../utils/envWriter";

const burpCollaborator: ToolDefinition = {
  name: "burp_collaborator",
  description:
    "Interact with Burp Collaborator for out-of-band (OOB) testing. " +
    'Use action "generate" to create a Collaborator payload domain that can be injected ' +
    "into requests to detect blind SSRF, XXE, blind SQL injection, or other OOB vulnerabilities. " +
    'Use action "poll" with the secret key returned from generate to check for DNS/HTTP/SMTP ' +
    "interactions that occurred against the payload.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["generate", "poll"],
        description: '"generate" creates a new Collaborator payload, "poll" checks for interactions.',
      },
      secret_key: {
        type: "string",
        description: 'Required for "poll" action. The secret key returned from a previous "generate" call.',
      },
      custom_data: {
        type: "string",
        description: 'Optional data to embed in the payload (max 16 alphanumeric chars). Only used with "generate".',
      },
    },
    required: ["action"],
  },
  timeoutMs: 30_000,
  async execute(args, _ctx) {
    const { action, secret_key, custom_data } = args;

    const env = readEnvFile();
    const connHost = env.BURP_RPC_HOST;
    const connPort = parseInt(env.BURP_RPC_PORT || "50051", 10);

    if (!connHost) {
      return {
        output: "Error: Burp RPC is not configured. Set BURP_RPC_HOST and BURP_RPC_PORT in Settings.",
        exitCode: 1,
      };
    }

    try {
      const { BurpClient } = await import("burp-rpc");
      const burp = new BurpClient({ host: connHost, port: connPort });

      try {
        if (action === "generate") {
          const result = await burp.collaborator.generatePayload(custom_data || "");
          return {
            output:
              `Collaborator payload generated:\n` +
              `  Payload: ${result.payload}\n` +
              `  Server:  ${result.server}\n` +
              `  Secret Key: ${result.secretKey}\n\n` +
              `Inject this payload into requests and then poll with the secret key to check for interactions.`,
            exitCode: 0,
          };
        }

        if (action === "poll") {
          if (!secret_key) {
            return { output: 'Error: secret_key is required for "poll" action.', exitCode: 1 };
          }

          const interactions = await burp.collaborator.poll(secret_key);

          if (interactions.length === 0) {
            return {
              output: "No Collaborator interactions found. The payload may not have been triggered yet.",
              exitCode: 0,
            };
          }

          const lines = interactions.map(
            (i: any, idx: number) =>
              `[${idx + 1}] ${i.type} interaction from ${i.clientIp}:${i.clientPort} at ${i.timestamp}` +
              (i.customData ? ` (custom: ${i.customData})` : "")
          );

          return {
            output: `Found ${interactions.length} Collaborator interaction(s):\n${lines.join("\n")}`,
            exitCode: 0,
          };
        }

        return { output: `Error: Unknown action "${action}". Use "generate" or "poll".`, exitCode: 1 };
      } finally {
        burp.close();
      }
    } catch (err: any) {
      if (err?.code === 14) {
        return {
          output: `Error: Could not connect to Burp Suite at ${connHost}:${connPort}.`,
          exitCode: 1,
        };
      }
      return { output: `Error with Collaborator: ${err.message}`, exitCode: 1 };
    }
  },
};

export default burpCollaborator;
