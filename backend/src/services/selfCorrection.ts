import { ToolResult } from "../tools/types";

// ─── Self-Correction Loop ───────────────────────────────────────────
// เมื่อ AI รันคำสั่งแล้วเกิด Error (Syntax ผิด, Flag ไม่ตรงเวอร์ชัน,
// Port ปิด) ให้ป้อน stderr กลับเข้า AI เพื่อให้มันวิเคราะห์ ปรับแก้
// แล้วลองรันใหม่เองโดยอัตโนมัติ

export interface CorrectionAttempt {
  attempt: number;
  command: string;
  error: string;
  correctedCommand?: string;
  result?: ToolResult;
  success: boolean;
}

export interface SelfCorrectionConfig {
  enabled: boolean;
  maxAttempts: number;
  // จำนวนครั้งสูงสุดที่ให้ AI ลองแก้ไขคำสั่งเดิม
  maxRetriesPerCommand: number;
  // รายการ error patterns ที่ควรพยายามแก้ไข
  retryableErrorPatterns: RegExp[];
  // รายการ error patterns ที่ไม่ควรลองแก้ไข (ให้หยุดทันที)
  fatalErrorPatterns: RegExp[];
}

export interface SelfCorrectionResult {
  finalResult: ToolResult;
  attempts: CorrectionAttempt[];
  corrected: boolean;
  exhausted: boolean;
}

// ─── Default config ─────────────────────────────────────────────────

export function createDefaultSelfCorrectionConfig(): SelfCorrectionConfig {
  return {
    enabled: true,
    maxAttempts: 3,
    maxRetriesPerCommand: 2,
    retryableErrorPatterns: [
      /command not found/i,
      /no such file or directory/i,
      /invalid option/i,
      /unrecognized option/i,
      /unknown option/i,
      /usage:/i,
      /syntax error/i,
      /parse error/i,
      /connection refused/i,
      /connection timed out/i,
      /timed out/i,
      /permission denied/i,
      /authentication failed/i,
      /invalid flag/i,
      /unknown flag/i,
      /flag provided but not defined/i,
      /no route to host/i,
      /network is unreachable/i,
      /could not resolve/i,
      /failed to connect/i,
      /error:/i,
      /exception/i,
    ],
    fatalErrorPatterns: [
      /segmentation fault/i,
      /core dumped/i,
      /out of memory/i,
      /killed/i,
      /panic:/i,
    ],
  };
}

// ─── Error classification ───────────────────────────────────────────

export function isRetryableError(
  error: string,
  config: SelfCorrectionConfig,
): boolean {
  if (config.fatalErrorPatterns.some((p) => p.test(error))) return false;
  return config.retryableErrorPatterns.some((p) => p.test(error));
}

export function isFatalError(
  error: string,
  config: SelfCorrectionConfig,
): boolean {
  return config.fatalErrorPatterns.some((p) => p.test(error));
}

// ─── Build correction prompt ────────────────────────────────────────

export function buildCorrectionPrompt(
  originalCommand: string,
  error: string,
  attempt: number,
  maxAttempts: number,
): string {
  return `[SYSTEM: Self-Correction]
The previous command failed with an error. Analyze the error and provide a corrected command.

Original command:
\`\`\`
${originalCommand}
\`\`\`

Error (attempt ${attempt}/${maxAttempts}):
\`\`\`
${error}
\`\`\`

Instructions:
1. Identify the root cause of the error (syntax, wrong flag, wrong version, closed port, etc.)
2. Provide a corrected command that addresses the root cause
3. If the error is a connection issue, verify the target is reachable first
4. If the error is a tool version mismatch, check the correct flags for the installed version
5. Only provide the corrected command — no explanation needed

Corrected command:
\`\`\`
`;
}

// ─── Extract corrected command from LLM response ────────────────────

export function extractCorrectedCommand(response: string): string | null {
  // Try to extract from code block
  const codeBlockMatch = response.match(/```(?:bash|sh|shell)?\s*\n([\s\S]*?)```/);
  if (codeBlockMatch) {
    const cmd = codeBlockMatch[1].trim();
    if (cmd) return cmd;
  }

  // Try to extract the last line that looks like a command
  const lines = response.split("\n").map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    // Skip obvious non-command lines
    if (
      line.startsWith("#") ||
      line.startsWith("//") ||
      line.startsWith("The") ||
      line.startsWith("Here") ||
      line.startsWith("Corrected") ||
      line.startsWith("```")
    ) {
      continue;
    }
    if (line.length > 2 && !line.includes(" ")) {
      return line;
    }
  }

  return null;
}

// ─── Payload Mutation Engine ────────────────────────────────────────
// เมื่อพบว่าคำสั่งถูกบล็อกด้วย HTTP 403 หรือ WAF Signatures ให้ทดลอง
// ดัดแปลง Payload (Encoding, Case, Comment Injection)

export interface PayloadMutation {
  name: string;
  description: string;
  mutate: (payload: string) => string;
}

export const PAYLOAD_MUTATIONS: PayloadMutation[] = [
  {
    name: "url_encode",
    description: "URL-encode special characters",
    mutate: (p) => encodeURIComponent(p),
  },
  {
    name: "double_url_encode",
    description: "Double URL-encode special characters",
    mutate: (p) => encodeURIComponent(encodeURIComponent(p)),
  },
  {
    name: "mixed_case",
    description: "Mix uppercase/lowercase to bypass case-sensitive WAF rules",
    mutate: (p) => {
      let out = "";
      for (let i = 0; i < p.length; i++) {
        const c = p[i];
        if (i % 2 === 0) out += c.toUpperCase();
        else out += c.toLowerCase();
      }
      return out;
    },
  },
  {
    name: "comment_injection",
    description: "Inject SQL-style comments to break WAF signatures",
    mutate: (p) => p.replace(/(\s+)/g, "/**/$1"),
  },
  {
    name: "tab_encoding",
    description: "Replace spaces with tabs",
    mutate: (p) => p.replace(/ /g, "\t"),
  },
  {
    name: "hex_encoding",
    description: "Hex-encode the payload",
    mutate: (p) => {
      let hex = "";
      for (let i = 0; i < p.length; i++) {
        hex += p.charCodeAt(i).toString(16).padStart(2, "0");
      }
      return hex;
    },
  },
  {
    name: "unicode_escape",
    description: "Unicode-escape special characters",
    mutate: (p) => {
      let out = "";
      for (const c of p) {
        if (/[^a-zA-Z0-9]/.test(c)) {
          out += `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`;
        } else {
          out += c;
        }
      }
      return out;
    },
  },
];

export function mutatePayload(
  payload: string,
  mutationName?: string,
): string[] {
  if (mutationName) {
    const mutation = PAYLOAD_MUTATIONS.find((m) => m.name === mutationName);
    if (mutation) return [mutation.mutate(payload)];
    return [payload];
  }

  // Return all mutations
  return PAYLOAD_MUTATIONS.map((m) => m.mutate(payload));
}

export function isWafBlocked(result: ToolResult): boolean {
  const output = result.output.toLowerCase();
  return (
    output.includes("403 forbidden") ||
    output.includes("waf") ||
    output.includes("access denied") ||
    output.includes("blocked by") ||
    output.includes("mod_security") ||
    output.includes("cloudflare") ||
    output.includes("request blocked")
  );
}

// ─── Main self-correction orchestrator ──────────────────────────────

export interface CorrectionExecutor {
  (command: string): Promise<ToolResult>;
}

export async function runSelfCorrection(
  originalCommand: string,
  initialResult: ToolResult,
  executor: CorrectionExecutor,
  config: SelfCorrectionConfig = createDefaultSelfCorrectionConfig(),
  onAttempt?: (attempt: CorrectionAttempt) => void,
): Promise<SelfCorrectionResult> {
  const attempts: CorrectionAttempt[] = [];
  let currentResult = initialResult;
  let corrected = false;
  let exhausted = false;

  // If the initial command succeeded, no correction needed
  if (initialResult.exitCode === 0) {
    return {
      finalResult: initialResult,
      attempts,
      corrected: false,
      exhausted: false,
    };
  }

  const error = initialResult.output;

  // If the error is fatal, don't attempt correction
  if (isFatalError(error, config)) {
    return {
      finalResult: initialResult,
      attempts,
      corrected: false,
      exhausted: false,
    };
  }

  // If the error is not retryable, don't attempt correction
  if (!isRetryableError(error, config)) {
    return {
      finalResult: initialResult,
      attempts,
      corrected: false,
      exhausted: false,
    };
  }

  // If WAF blocked, try payload mutations
  if (isWafBlocked(initialResult)) {
    const mutations = mutatePayload(originalCommand);
    for (let i = 0; i < Math.min(mutations.length, config.maxAttempts); i++) {
      const mutated = mutations[i];
      const attempt: CorrectionAttempt = {
        attempt: i + 1,
        command: mutated,
        error: "WAF blocked — attempting payload mutation",
        success: false,
      };
      try {
        const result = await executor(mutated);
        attempt.result = result;
        attempt.success = result.exitCode === 0;
        attempts.push(attempt);
        if (onAttempt) onAttempt(attempt);
        if (result.exitCode === 0) {
          currentResult = result;
          corrected = true;
          return { finalResult: currentResult, attempts, corrected, exhausted: false };
        }
      } catch (err: any) {
        attempt.error = err.message ?? String(err);
        attempts.push(attempt);
        if (onAttempt) onAttempt(attempt);
      }
    }
    exhausted = true;
    return { finalResult: currentResult, attempts, corrected, exhausted };
  }

  // Standard retry loop — the caller provides the corrected command via
  // the executor (which should use the LLM to generate a corrected command).
  // Here we simply re-run the same command up to maxRetriesPerCommand times,
  // allowing the executor to apply its own correction logic.
  for (let i = 0; i < config.maxRetriesPerCommand; i++) {
    const attempt: CorrectionAttempt = {
      attempt: i + 1,
      command: originalCommand,
      error,
      success: false,
    };
    try {
      const result = await executor(originalCommand);
      attempt.result = result;
      attempt.success = result.exitCode === 0;
      attempts.push(attempt);
      if (onAttempt) onAttempt(attempt);
      if (result.exitCode === 0) {
        currentResult = result;
        corrected = true;
        return { finalResult: currentResult, attempts, corrected, exhausted: false };
      }
    } catch (err: any) {
      attempt.error = err.message ?? String(err);
      attempts.push(attempt);
      if (onAttempt) onAttempt(attempt);
    }
  }

  exhausted = true;
  return { finalResult: currentResult, attempts, corrected, exhausted };
}
