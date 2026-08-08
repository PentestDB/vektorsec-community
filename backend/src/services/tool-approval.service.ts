import type { ToolExecutionMode } from "../models/User/User.model";
import type { ExecutionContext, ToolDefinition } from "../tools/types";
import type { ProviderConfig } from "../utils/llm/providers";
import { invoke_llm_streaming } from "../utils/llm/providers";

export interface ToolApprovalDecision {
  requireConsent: boolean;
  reason: string;
  source: "mode" | "tool" | "safety" | "ai" | "fallback";
}

export type ToolSafetyEvaluator = (input: {
  toolName: string;
  toolDescription: string;
  args: Record<string, unknown>;
  sessionId: string;
}) => Promise<{ safe: boolean; reason: string }>;

export async function decideToolConsent(params: {
  mode: ToolExecutionMode;
  tool: ToolDefinition;
  args: Record<string, unknown>;
  context: ExecutionContext;
  safetyTriggered: boolean;
  evaluator?: ToolSafetyEvaluator;
}): Promise<ToolApprovalDecision> {
  const { mode, tool, args, context, safetyTriggered, evaluator } = params;

  // Deterministic safety protections always outrank execution preferences.
  if (safetyTriggered) {
    return { requireConsent: true, reason: "Built-in safety protection flagged this action.", source: "safety" };
  }
  if (mode === "requires_consent") {
    return { requireConsent: true, reason: "This mode requires approval for every action.", source: "mode" };
  }
  if (mode === "auto") {
    return { requireConsent: false, reason: "Automatic execution is enabled.", source: "mode" };
  }

  // Auto Approve deliberately fails closed. A missing evaluator, provider
  // failure, timeout, or ambiguous response must never silently run an action.
  if (!evaluator) {
    return { requireConsent: true, reason: "Safety review was unavailable.", source: "fallback" };
  }
  try {
    const assessment = await evaluator({
      toolName: tool.name,
      toolDescription: tool.description,
      args,
      sessionId: context.sessionId,
    });
    if (assessment.safe === true) {
      return { requireConsent: false, reason: assessment.reason, source: "ai" };
    }
    return {
      requireConsent: true,
      reason: assessment.reason || "The safety review did not clearly approve this action.",
      source: "ai",
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { requireConsent: true, reason: `Safety review failed: ${detail}`, source: "fallback" };
  }
}

export function parseToolSafetyAssessment(content: string | null): { safe: boolean; reason: string } {
  if (!content) throw new Error("empty model response");
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("model response was not JSON");
    parsed = JSON.parse(match[0]);
  }
  if (!parsed || typeof parsed !== "object") throw new Error("invalid model response");
  const value = parsed as Record<string, unknown>;
  // Only an explicit boolean true is approval. Strings such as "true" and
  // missing/ambiguous verdicts fail closed.
  if (typeof value.safe !== "boolean") throw new Error("model response omitted a boolean safe verdict");
  return {
    safe: value.safe,
    reason: typeof value.reason === "string" ? value.reason.slice(0, 500) : "No reason provided.",
  };
}

export function createAiToolSafetyEvaluator(params: {
  provider: ProviderConfig;
  userId: string;
  abortSignal?: AbortSignal;
}): ToolSafetyEvaluator {
  return async ({ toolName, toolDescription, args, sessionId }) => {
    const result = await invoke_llm_streaming({
      providerOverride: params.provider,
      sessionId,
      userId: params.userId,
      generationName: "tool-safety-review",
      tags: ["agent", "tool_safety_review"],
      temperature: 0,
      reasoningMode: "off",
      format: "json",
      abortSignal: params.abortSignal,
      tools: [],
      messages: [
        {
          role: "system",
          content:
            "You are a conservative action-safety reviewer for an authorized pentesting workspace. " +
            "Approve only clearly bounded, reversible or read-only actions within the workspace or authorized target. " +
            "Reject actions that are destructive, disruptive, privilege/persistence changing, expose secrets, affect broad or unclear targets, " +
            "install software, alter network/system configuration, or whose impact is ambiguous. " +
            "Return exactly JSON: {\"safe\":boolean,\"reason\":string}. When uncertain, safe must be false.",
        },
        {
          role: "user",
          content: JSON.stringify({ tool: toolName, description: toolDescription, arguments: args }),
        },
      ],
      onDelta() {},
    });
    return parseToolSafetyAssessment(result.content);
  };
}
