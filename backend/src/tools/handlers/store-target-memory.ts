import { ToolDefinition } from "../types";
import { TargetMemoryStore, TargetMemoryEntry } from "../../services/attackChain";
import SessionsModel from "../../models/Sessions/Sessions.model";

// Target memory is persisted in the Session document so scan findings survive
// server restarts and stay available to the agent across turns.

async function loadStore(sessionId: string): Promise<TargetMemoryStore> {
  const session = await SessionsModel.findOne({ sessionId })
    .select("targetMemory")
    .lean();
  const store = new TargetMemoryStore(sessionId);
  for (const entry of session?.targetMemory ?? []) {
    store.hydrate(entry as TargetMemoryEntry);
  }
  return store;
}

async function saveStore(sessionId: string, store: TargetMemoryStore): Promise<void> {
  await SessionsModel.updateOne(
    { sessionId },
    { $set: { targetMemory: store.getAll() } },
  );
}

const storeTargetMemory: ToolDefinition = {
  name: "store_target_memory",
  allowedRoles: ["orchestrator", "swarm_agent"],
  description:
    "Store scan results and findings about a target in persistent memory. " +
    "Use this to save important data (open ports, services, URLs, credentials, findings) " +
    "so you can retrieve it later without re-scanning. This prevents losing context " +
    "when the conversation gets long. Persisted and injected into your system prompt.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["store", "query", "get_all", "get_by_target"],
        description: "The action to perform",
      },
      target: {
        type: "string",
        description: "The target IP, domain, or URL",
      },
      data_type: {
        type: "string",
        enum: ["host", "service", "port", "url", "finding", "credential", "note"],
        description: "The type of data being stored",
      },
      source: {
        type: "string",
        description: "The source of the data (nmap, burp, ffuf, manual, etc.)",
      },
      content: {
        type: "string",
        description: "The content/finding to store",
      },
      metadata: {
        type: "object",
        description: "Additional metadata (port number, service version, etc.)",
      },
    },
    required: ["action"],
  },
  timeoutMs: 20_000,
  async execute(args, ctx) {
    const { action, target, data_type, source, content, metadata } = args;
    const sessionId = ctx.sessionId ?? "unknown";

    try {
      const store = await loadStore(sessionId);

      switch (action) {
        case "store": {
          if (!target || !content) {
            return { output: "Error: target and content are required for store", exitCode: 1 };
          }
          const entry = store.add({
            target,
            source: source ?? "manual",
            dataType: data_type ?? "note",
            content,
            metadata,
          });
          await saveStore(sessionId, store);
          return {
            output: `Stored: [${entry.dataType}] ${entry.target} (${entry.source}): ${entry.content}`,
            exitCode: 0,
          };
        }

        case "query": {
          const results = store.query(target, data_type, source);
          if (results.length === 0) {
            return { output: "No matching memory entries found", exitCode: 0 };
          }
          const lines = results.map((e) =>
            `- [${e.dataType}] ${e.target} (${e.source}): ${e.content}`,
          );
          return { output: lines.join("\n"), exitCode: 0 };
        }

        case "get_all": {
          const results = store.getAll();
          if (results.length === 0) {
            return { output: "No memory entries stored yet", exitCode: 0 };
          }
          const lines = results.map((e) =>
            `- [${e.dataType}] ${e.target} (${e.source}): ${e.content}`,
          );
          return { output: lines.join("\n"), exitCode: 0 };
        }

        case "get_by_target": {
          if (!target) {
            return { output: "Error: target is required for get_by_target", exitCode: 1 };
          }
          const results = store.getByTarget(target);
          if (results.length === 0) {
            return { output: `No memory entries found for target: ${target}`, exitCode: 0 };
          }
          const lines = results.map((e) =>
            `- [${e.dataType}] (${e.source}): ${e.content}`,
          );
          return { output: lines.join("\n"), exitCode: 0 };
        }

        default:
          return { output: `Error: unknown action '${action}'`, exitCode: 1 };
      }
    } catch (err: any) {
      return { output: `Error with target memory: ${err.message}`, exitCode: 1 };
    }
  },
};

export default storeTargetMemory;
