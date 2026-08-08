import { ToolDefinition } from "../types";
import { EvidenceCollector } from "../../services/evidenceCollector";

// In-memory store for evidence per session
const evidenceCollectors = new Map<string, EvidenceCollector>();

export function getEvidenceCollector(sessionId: string): EvidenceCollector {
  if (!evidenceCollectors.has(sessionId)) {
    evidenceCollectors.set(sessionId, new EvidenceCollector(sessionId));
  }
  return evidenceCollectors.get(sessionId)!;
}

const collectEvidence: ToolDefinition = {
  name: "collect_evidence",
  allowedRoles: ["orchestrator", "swarm_agent"],
  description:
    "Collect and store evidence for the pentest report. Use this to save raw request/response, " +
    "terminal output, tool output, and findings. This evidence will be used to generate " +
    "the final report automatically.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["add", "get_all", "get_by_finding"],
        description: "The action to perform",
      },
      type: {
        type: "string",
        enum: ["request_response", "terminal_output", "tool_output", "finding", "note"],
        description: "The type of evidence",
      },
      title: {
        type: "string",
        description: "A descriptive title for the evidence",
      },
      content: {
        type: "string",
        description: "The evidence content (request/response, output, etc.)",
      },
      metadata: {
        type: "object",
        description: "Additional metadata",
      },
      finding_id: {
        type: "string",
        description: "Link this evidence to a finding ID",
      },
    },
    required: ["action"],
  },
  timeoutMs: 10_000,
  async execute(args, ctx) {
    const { action, type, title, content, metadata, finding_id } = args;
    const sessionId = ctx.sessionId ?? "unknown";
    const collector = getEvidenceCollector(sessionId);

    switch (action) {
      case "add": {
        if (!title || !content) {
          return { output: "Error: title and content are required for add", exitCode: 1 };
        }
        const item = collector.add({
          type: type ?? "note",
          title,
          content,
          metadata,
          linkedFindingId: finding_id,
        });
        return {
          output: `Evidence stored: ${item.title} (${item.type})`,
          exitCode: 0,
        };
      }

      case "get_all": {
        const items = collector.getAll();
        if (items.length === 0) {
          return { output: "No evidence collected yet", exitCode: 0 };
        }
        const lines = items.map((e) =>
          `- [${e.type}] ${e.title}${e.linkedFindingId ? ` (finding: ${e.linkedFindingId})` : ""}`,
        );
        return { output: lines.join("\n"), exitCode: 0 };
      }

      case "get_by_finding": {
        if (!finding_id) {
          return { output: "Error: finding_id is required for get_by_finding", exitCode: 1 };
        }
        const items = collector.getByFinding(finding_id);
        if (items.length === 0) {
          return { output: `No evidence found for finding: ${finding_id}`, exitCode: 0 };
        }
        const lines = items.map((e) =>
          `- [${e.type}] ${e.title}: ${e.content}`,
        );
        return { output: lines.join("\n"), exitCode: 0 };
      }

      default:
        return { output: `Error: unknown action '${action}'`, exitCode: 1 };
    }
  },
};

export default collectEvidence;
