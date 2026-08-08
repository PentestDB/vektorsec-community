import { ToolDefinition } from "../types";
import { getRAGPipeline } from "../../services/ragPipeline";
import { getAuditTrail } from "../../services/auditTrail";

// ─── Knowledge Query Tool (RAG) ─────────────────────────────────────
// ให้ AI ค้นหาข้อมูลจาก Knowledge Base (CVE, Exploit-DB, OWASP)
// เพื่อใช้ประกอบการตัดสินใจโดยไม่ต้องส่งข้อมูลออกภายนอก

const queryKnowledge: ToolDefinition = {
  name: "query_knowledge",
  allowedRoles: ["orchestrator", "swarm_agent"],
  description:
    "Query the local knowledge base for vulnerability information, exploit techniques, " +
    "and OWASP guidance. Use this to find CVE details, exploit PoCs, and remediation " +
    "steps without sending data to external services. This is a RAG (Retrieval-Augmented " +
    "Generation) pipeline that searches CVE databases, Exploit-DB, and OWASP cheatsheets.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query (e.g. 'Log4j RCE exploit', 'SQL injection mitigation')",
      },
      category: {
        type: "string",
        enum: ["cve", "exploit", "owasp", "nuclei_template", "chat_history", "target_memory", "finding"],
        description: "Filter by knowledge category",
      },
      limit: {
        type: "number",
        description: "Maximum number of results (default: 5)",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Filter by tags (e.g. ['rce', 'windows'])",
      },
    },
    required: ["query"],
  },
  timeoutMs: 10_000,
  async execute(args, ctx) {
    const { query, category, limit, tags } = args;

    if (!query) {
      return { output: "Error: query is required", exitCode: 1 };
    }

    const rag = getRAGPipeline();
    const audit = getAuditTrail();

    const result = rag.retrieve(query, {
      category,
      limit,
      tags,
      includeMetadata: true,
    });

    // Audit log
    audit.log({
      action: "tool_called",
      severity: "info",
      userId: ctx.agentId,
      sessionId: ctx.sessionId,
      toolName: "query_knowledge",
      details: { query, category, resultsFound: result.totalFound },
    });

    if (result.totalFound === 0) {
      return {
        output: `No knowledge found for query: "${query}"\n\nTry a different query or category.`,
        exitCode: 0,
      };
    }

    const lines = [
      `Found ${result.totalFound} result(s) for: "${query}"`,
      "",
    ];

    for (const r of result.results) {
      lines.push(`[${r.category.toUpperCase()}] ${r.title}`);
      if (r.source) lines.push(`  Source: ${r.source}`);
      if (r.metadata && Object.keys(r.metadata).length > 0) {
        const metaStr = Object.entries(r.metadata)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");
        lines.push(`  Metadata: ${metaStr}`);
      }
      lines.push(`  Score: ${r.score.toFixed(3)}`);
      lines.push(`  ${r.content}`);
      lines.push("");
    }

    return {
      output: lines.join("\n"),
      exitCode: 0,
    };
  },
};

export default queryKnowledge;
