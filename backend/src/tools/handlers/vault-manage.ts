import { ToolDefinition } from "../types";
import { getVault, SecretType } from "../../services/vault";
import { getAuditTrail } from "../../services/auditTrail";

// ─── Vault Management Tool ──────────────────────────────────────────
// จัดการ API Credentials แบบ Encrypted at Rest (AES-256-GCM)
// ห้าม Hardcode ลง DB ปกติ

const vaultManage: ToolDefinition = {
  name: "vault_manage",
  allowedRoles: ["orchestrator"],
  description:
    "Manage API credentials and secrets in the encrypted vault. " +
    "Secrets are encrypted at rest using AES-256-GCM and never stored in plaintext. " +
    "Use this to store, retrieve, list, or delete API keys (OpenAI, Shodan, AWS, etc.).",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["store", "retrieve", "list", "delete", "verify"],
        description: "The action to perform",
      },
      name: {
        type: "string",
        description: "The name of the secret (e.g. 'shodan_api_key')",
      },
      type: {
        type: "string",
        enum: ["openai", "anthropic", "shodan", "aws", "github", "nuclei", "custom"],
        description: "The type of secret",
      },
      value: {
        type: "string",
        description: "The secret value (for store action)",
      },
      secret_id: {
        type: "string",
        description: "The secret ID (for retrieve/delete/verify actions)",
      },
      metadata: {
        type: "object",
        description: "Additional metadata",
      },
    },
    required: ["action"],
  },
  timeoutMs: 10_000,
  async execute(args, ctx) {
    const { action, name, type, value, secret_id, metadata } = args;

    if (!action) {
      return { output: "Error: action is required", exitCode: 1 };
    }

    const vault = getVault();
    const audit = getAuditTrail();

    switch (action) {
      case "store": {
        if (!name || !value) {
          return { output: "Error: name and value are required for store", exitCode: 1 };
        }
        const secret = vault.store({
          name,
          type: (type as SecretType) ?? "custom",
          value,
          metadata,
        });

        audit.log({
          action: "api_key_created",
          severity: "warning",
          userId: ctx.agentId,
          sessionId: ctx.sessionId,
          details: { secretName: name, secretType: type },
        });

        return {
          output: [
            `Secret stored securely:`,
            `  ID: ${secret.id}`,
            `  Name: ${secret.name}`,
            `  Type: ${secret.type}`,
            `  Encrypted: AES-256-GCM`,
            ``,
            `The secret value is encrypted at rest and cannot be viewed.`,
          ].join("\n"),
          exitCode: 0,
        };
      }

      case "retrieve": {
        const result = secret_id
          ? vault.retrieve(secret_id)
          : name
            ? vault.retrieveByName(name)
            : null;

        if (!result) {
          return { output: "Secret not found", exitCode: 1 };
        }

        audit.log({
          action: "tool_called",
          severity: "info",
          userId: ctx.agentId,
          sessionId: ctx.sessionId,
          toolName: "vault_manage",
          details: { action: "retrieve", secretName: result.secret.name },
        });

        return {
          output: [
            `Secret retrieved:`,
            `  ID: ${result.secret.id}`,
            `  Name: ${result.secret.name}`,
            `  Type: ${result.secret.type}`,
            `  Value: ${result.value.slice(0, 4)}...${result.value.slice(-4)}`,
            ``,
            `WARNING: Handle this value carefully. It will appear in the conversation.`,
          ].join("\n"),
          exitCode: 0,
        };
      }

      case "list": {
        const secrets = vault.list();
        if (secrets.length === 0) {
          return { output: "No secrets stored in vault", exitCode: 0 };
        }
        const lines = secrets.map((s) =>
          `- [${s.type}] ${s.name} (ID: ${s.id.slice(0, 8)}...)`,
        );
        return {
          output: `Stored secrets (${secrets.length}):\n${lines.join("\n")}`,
          exitCode: 0,
        };
      }

      case "delete": {
        if (!secret_id) {
          return { output: "Error: secret_id is required for delete", exitCode: 1 };
        }
        const deleted = vault.delete(secret_id);

        audit.log({
          action: "api_key_revoked",
          severity: "warning",
          userId: ctx.agentId,
          sessionId: ctx.sessionId,
          details: { secretId: secret_id },
        });

        return {
          output: deleted
            ? `Secret '${secret_id}' deleted from vault`
            : `Secret '${secret_id}' not found`,
          exitCode: deleted ? 0 : 1,
        };
      }

      case "verify": {
        if (!secret_id || !value) {
          return { output: "Error: secret_id and value are required for verify", exitCode: 1 };
        }
        const valid = vault.verify(secret_id, value);
        return {
          output: valid
            ? `Secret verified: value matches`
            : `Secret verification FAILED: value does not match`,
          exitCode: valid ? 0 : 1,
        };
      }

      default:
        return { output: `Error: unknown action '${action}'`, exitCode: 1 };
    }
  },
};

export default vaultManage;
