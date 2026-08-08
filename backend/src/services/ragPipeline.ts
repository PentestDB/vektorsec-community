import { getKnowledgeBase, KnowledgeCategory } from "./knowledgeBase";

// ─── RAG Pipeline ───────────────────────────────────────────────────
// Retrieval-Augmented Generation Pipeline
// ให้ AI ค้นหาข้อมูลภัยคุกคามล่าสุด (CVE, Exploit-DB, OWASP, Nuclei Templates)
// จาก Vector DB ฝั่ง Backend เพื่อให้ AI สามารถค้นหา PoC หรือวิธี Exploit
// ช่องโหว่ใหม่ๆ ได้โดยไม่ต้องส่งข้อมูลออกภายนอก

export interface RAGQueryOptions {
  category?: KnowledgeCategory;
  limit?: number;
  minScore?: number;
  tags?: string[];
  includeMetadata?: boolean;
}

export interface RAGResult {
  query: string;
  results: Array<{
    title: string;
    content: string;
    category: KnowledgeCategory;
    score: number;
    metadata: Record<string, any>;
    source?: string;
  }>;
  context: string; // formatted context for LLM prompt
  totalFound: number;
}

// ─── RAG Pipeline ───────────────────────────────────────────────────

export class RAGPipeline {
  private knowledgeBase = getKnowledgeBase();

  // Retrieve relevant knowledge for a query
  retrieve(query: string, options: RAGQueryOptions = {}): RAGResult {
    const results = this.knowledgeBase.search(query, {
      category: options.category,
      limit: options.limit ?? 5,
      minScore: options.minScore ?? 0.1,
      tags: options.tags,
    });

    const formatted = results.map((r) => ({
      title: r.entry.title,
      content: r.entry.content,
      category: r.entry.category,
      score: r.score,
      metadata: options.includeMetadata ? r.entry.metadata : {},
      source: r.entry.source,
    }));

    // Build context block for LLM prompt
    const context = formatted
      .map((r, i) => {
        const source = r.source ? ` [Source: ${r.source}]` : "";
        return `[${i + 1}] ${r.title}${source}\n${r.content}`;
      })
      .join("\n\n");

    return {
      query,
      results: formatted,
      context,
      totalFound: formatted.length,
    };
  }

  // Retrieve CVE knowledge specifically
  retrieveCve(query: string, limit = 3): RAGResult {
    return this.retrieve(query, { category: "cve", limit });
  }

  // Retrieve exploit knowledge
  retrieveExploit(query: string, limit = 3): RAGResult {
    return this.retrieve(query, { category: "exploit", limit });
  }

  // Retrieve OWASP knowledge
  retrieveOwasp(query: string, limit = 3): RAGResult {
    return this.retrieve(query, { category: "owasp", limit });
  }

  // Store a new knowledge entry (e.g. from scan results)
  storeKnowledge(params: {
    category: KnowledgeCategory;
    title: string;
    content: string;
    metadata?: Record<string, any>;
    tags?: string[];
    source?: string;
  }): void {
    this.knowledgeBase.add(params);
  }

  // Store chat history for future retrieval
  storeChatHistory(sessionId: string, role: string, content: string): void {
    this.knowledgeBase.add({
      category: "chat_history",
      title: `Chat ${role} - ${new Date().toISOString()}`,
      content,
      metadata: { sessionId, role },
      tags: ["chat", sessionId],
      source: "chat",
    });
  }

  // Build a RAG-augmented system prompt
  buildRagPrompt(userQuery: string, options: RAGQueryOptions = {}): {
    systemPrompt: string;
    context: string;
  } {
    const ragResult = this.retrieve(userQuery, options);

    const systemPrompt = [
      "You are a penetration testing assistant with access to a local knowledge base.",
      "Use the following retrieved knowledge to inform your responses:",
      "",
      "=== RETRIEVED KNOWLEDGE ===",
      ragResult.context || "(No relevant knowledge found)",
      "=== END RETRIEVED KNOWLEDGE ===",
      "",
      "If the retrieved knowledge is relevant, use it to provide accurate, up-to-date",
      "information about vulnerabilities, exploits, and remediation.",
    ].join("\n");

    return {
      systemPrompt,
      context: ragResult.context,
    };
  }
}

// ─── Singleton instance ─────────────────────────────────────────────

let ragPipelineInstance: RAGPipeline | null = null;

export function getRAGPipeline(): RAGPipeline {
  if (!ragPipelineInstance) {
    ragPipelineInstance = new RAGPipeline();
  }
  return ragPipelineInstance;
}
