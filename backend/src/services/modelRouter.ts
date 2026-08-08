// ─── Multi-Model Routing & Specialist Fine-Tuning ───────────────────
// ใช้ Model ขนาดเล็ก/ไว ในการ Parse Log, Extract URLs, สรุปผล Output
// ใช้ Model ขนาดใหญ่ หรือ Code Model ในการสร้าง Exploit Script
// รองรับ Local LLMs (Ollama / DeepSeek-Coder / Llama 3)

export type TaskType =
  | "parse_log"
  | "extract_urls"
  | "summarize"
  | "exploit_script"
  | "reverse_shell"
  | "bypass_payload"
  | "recon_analysis"
  | "vuln_analysis"
  | "report_generation"
  | "general";

export interface ModelProfile {
  id: string;
  name: string;
  provider: "openai" | "anthropic" | "local" | "custom";
  // ความสามารถของ model
  capabilities: {
    codeGeneration: boolean;
    longContext: boolean;
    fast: boolean;
    securitySpecialist: boolean;
  };
  // คะแนนความเหมาะสมกับงานแต่ละประเภท (0-1)
  taskSuitability: Record<TaskType, number>;
  // ราคาต่อ 1K tokens
  costPer1kInput: number;
  costPer1kOutput: number;
  // สำหรับ local models
  baseUrl?: string;
  apiKey?: string;
}

export interface RoutingDecision {
  modelId: string;
  modelName: string;
  taskType: TaskType;
  reason: string;
  estimatedCost: number;
}

// ─── Model catalog ──────────────────────────────────────────────────

export const MODEL_CATALOG: ModelProfile[] = [
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    capabilities: { codeGeneration: true, longContext: true, fast: true, securitySpecialist: false },
    taskSuitability: {
      parse_log: 0.7, extract_urls: 0.7, summarize: 0.8,
      exploit_script: 0.9, reverse_shell: 0.9, bypass_payload: 0.8,
      recon_analysis: 0.8, vuln_analysis: 0.9, report_generation: 0.9, general: 0.9,
    },
    costPer1kInput: 0.005, costPer1kOutput: 0.015,
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    capabilities: { codeGeneration: true, longContext: true, fast: true, securitySpecialist: false },
    taskSuitability: {
      parse_log: 0.9, extract_urls: 0.9, summarize: 0.9,
      exploit_script: 0.6, reverse_shell: 0.6, bypass_payload: 0.5,
      recon_analysis: 0.7, vuln_analysis: 0.6, report_generation: 0.7, general: 0.8,
    },
    costPer1kInput: 0.00015, costPer1kOutput: 0.0006,
  },
  {
    id: "claude-sonnet",
    name: "Claude Sonnet",
    provider: "anthropic",
    capabilities: { codeGeneration: true, longContext: true, fast: true, securitySpecialist: false },
    taskSuitability: {
      parse_log: 0.8, extract_urls: 0.8, summarize: 0.9,
      exploit_script: 0.9, reverse_shell: 0.9, bypass_payload: 0.8,
      recon_analysis: 0.8, vuln_analysis: 0.9, report_generation: 0.9, general: 0.9,
    },
    costPer1kInput: 0.003, costPer1kOutput: 0.015,
  },
  {
    id: "deepseek-coder",
    name: "DeepSeek Coder",
    provider: "local",
    capabilities: { codeGeneration: true, longContext: true, fast: true, securitySpecialist: true },
    taskSuitability: {
      parse_log: 0.8, extract_urls: 0.8, summarize: 0.7,
      exploit_script: 0.95, reverse_shell: 0.95, bypass_payload: 0.9,
      recon_analysis: 0.7, vuln_analysis: 0.8, report_generation: 0.6, general: 0.7,
    },
    costPer1kInput: 0, costPer1kOutput: 0,
    baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
  },
  {
    id: "llama3",
    name: "Llama 3",
    provider: "local",
    capabilities: { codeGeneration: true, longContext: true, fast: true, securitySpecialist: false },
    taskSuitability: {
      parse_log: 0.8, extract_urls: 0.8, summarize: 0.8,
      exploit_script: 0.7, reverse_shell: 0.7, bypass_payload: 0.6,
      recon_analysis: 0.7, vuln_analysis: 0.7, report_generation: 0.7, general: 0.8,
    },
    costPer1kInput: 0, costPer1kOutput: 0,
    baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
  },
];

// ─── Routing logic ──────────────────────────────────────────────────

export function routeTask(
  taskType: TaskType,
  availableModels: ModelProfile[] = MODEL_CATALOG,
  options?: {
    preferLocal?: boolean;
    maxCost?: number;
    preferFast?: boolean;
  },
): RoutingDecision {
  const { preferLocal = false, maxCost, preferFast = false } = options ?? {};

  let candidates = [...availableModels];

  // Filter by cost if specified
  if (maxCost != null) {
    candidates = candidates.filter(
      (m) => m.costPer1kInput <= maxCost && m.costPer1kOutput <= maxCost,
    );
  }

  // Prefer local models if requested
  if (preferLocal) {
    const local = candidates.filter((m) => m.provider === "local");
    if (local.length > 0) candidates = local;
  }

  // Score each model for the task
  const scored = candidates.map((m) => ({
    model: m,
    score: m.taskSuitability[taskType] ?? 0.5,
  }));

  // Sort by score (descending), then by cost (ascending)
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.model.costPer1kInput - b.model.costPer1kInput;
  });

  if (scored.length === 0) {
    return {
      modelId: "gpt-4o-mini",
      modelName: "GPT-4o Mini",
      taskType,
      reason: "Fallback to default model",
      estimatedCost: 0,
    };
  }

  const best = scored[0];
  return {
    modelId: best.model.id,
    modelName: best.model.name,
    taskType,
    reason: `Best suited for ${taskType} (score: ${best.score.toFixed(2)})`,
    estimatedCost: best.model.costPer1kInput,
  };
}

// ─── Task type detection ────────────────────────────────────────────

export function detectTaskType(prompt: string): TaskType {
  const p = prompt.toLowerCase();

  if (/(parse|extract).*(log|output|result)/i.test(p) || /parse.*nmap|parse.*burp|parse.*ffuf/i.test(p)) {
    return "parse_log";
  }
  if (/(extract|find).*(url|link|endpoint)/i.test(p)) {
    return "extract_urls";
  }
  if (/(summarize|summary|สรุป)/i.test(p)) {
    return "summarize";
  }
  if (/(exploit|poc|proof.of.concept)/i.test(p) && /(script|code|python|bash)/i.test(p)) {
    return "exploit_script";
  }
  if (/(reverse.shell|bind.shell|shellcode)/i.test(p)) {
    return "reverse_shell";
  }
  if (/(bypass|waf|evade|encode.*payload)/i.test(p)) {
    return "bypass_payload";
  }
  if (/(recon|reconnaissance|nmap|scan)/i.test(p)) {
    return "recon_analysis";
  }
  if (/(vulnerability|vuln|cve|cvss)/i.test(p)) {
    return "vuln_analysis";
  }
  if (/(report|รายงาน|executive.summary|technical.report)/i.test(p)) {
    return "report_generation";
  }
  return "general";
}

// ─── Local LLM client (Ollama-compatible) ───────────────────────────

export interface LocalLlmRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  options?: Record<string, any>;
}

export interface LocalLlmResponse {
  model: string;
  response: string;
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}

export async function callLocalLlm(
  request: LocalLlmRequest,
  baseUrl: string = process.env.OLLAMA_BASE_URL || "http://localhost:11434",
): Promise<LocalLlmResponse> {
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Local LLM request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as LocalLlmResponse;
}

export async function isLocalLlmAvailable(
  baseUrl: string = process.env.OLLAMA_BASE_URL || "http://localhost:11434",
): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}
