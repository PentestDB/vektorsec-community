export type ModelReasoningMode =
  | "off"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export const MODEL_ALIASES: Record<string, string> = {
  "gpt-5.6-latest": "gpt-5.6-sol",
  "gpt-5.6": "gpt-5.6-sol",
  "gpt-5.5-latest": "gpt-5.5",
  "gpt-5.4-latest": "gpt-5.4",
  "claude-fable-5-latest": "claude-fable-5",
  "claude-opus-5-latest": "claude-opus-5",
  "claude-sonnet-5-latest": "claude-sonnet-5",
  "claude-opus-4.8": "claude-opus-4-8",
  "claude-opus-4.7": "claude-opus-4-7",
  "claude-mythos": "claude-mythos-preview",
  "claude-sonnet-4.6": "claude-sonnet-4-6",
  "claude-opus-4.6": "claude-opus-4-6",
  "claude-haiku-4.5": "claude-haiku-4-5",
  "claude-sonnet-4.5": "claude-sonnet-4-5",
  "claude-opus-4.5": "claude-opus-4-5",
  "claude-opus-4.1": "claude-opus-4-1",
  "kimi-k3-latest": "kimi-k3",
  "deepseek-chat-latest": "deepseek-chat",
  "deepseek-reasoner-latest": "deepseek-reasoner",
};

export function normalizeModelId(model: string): string {
  if (!model) return model;
  const trimmed = model.trim();
  return MODEL_ALIASES[trimmed] ?? trimmed;
}

// Keep the most specific identifiers first. Resolution also sorts by length so
// a future insertion cannot make `gpt-5.4` shadow `gpt-5.4-mini` again.
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "gpt-5.6-terra": 1_050_000,
  "gpt-5.6-luna": 1_050_000,
  "gpt-5.6-sol": 1_050_000,
  "gpt-5.6": 1_050_000,
  "gpt-5.5": 1_000_000,
  "gpt-5.4-mini": 400_000,
  "gpt-5.4-nano": 400_000,
  "gpt-5.4": 1_000_000,
  "gpt-5.3-codex-spark": 400_000,
  "gpt-5.3-codex": 400_000,
  "gpt-5.2": 400_000,
  "gpt-4.1-mini": 1_000_000,
  "gpt-4.1": 1_000_000,
  "gpt-4o-mini": 128_000,
  "gpt-4o": 128_000,
  "gpt-4-turbo-preview": 128_000,
  "gpt-4-turbo": 128_000,
  "gpt-4": 8_192,
  "gpt-3.5-turbo": 16_385,
  "gpt-5-nano": 128_000,
  "claude-fable-5": 1_000_000,
  "claude-mythos-5": 1_000_000,
  "claude-opus-5": 1_000_000,
  "claude-sonnet-5": 1_000_000,
  "claude-opus-4-8": 1_000_000,
  "claude-opus-4-7": 1_000_000,
  "claude-mythos-preview": 1_000_000,
  "claude-sonnet-4-6": 1_000_000,
  "claude-opus-4-6": 1_000_000,
  "claude-haiku-4-5": 200_000,
  "claude-sonnet-4-5": 200_000,
  "claude-sonnet-4-20250514": 200_000,
  "claude-3-5-sonnet-20241022": 200_000,
  "claude-3-opus-20240229": 200_000,
  "claude-3-haiku-20240307": 200_000,
  "kimi-k3": 1_000_000,
  "kimi-k2.7-code-highspeed": 256_000,
  "kimi-k2.7-code": 256_000,
  "kimi-k2.6": 256_000,
  "MiniMax-M2": 204_800,
  "deepseek-chat": 128_000,
  "deepseek-reasoner": 128_000,
  "deepseek-v3": 128_000,
  "deepseek-r1": 128_000,
  "MiniMax-M2.1": 204_800,
  "MiniMax-M2.1-highspeed": 204_800,
  "MiniMax-M2.5": 204_800,
  "MiniMax-M2.5-highspeed": 204_800,
  "MiniMax-M2.7": 204_800,
  "MiniMax-M2.7-highspeed": 204_800,
};

export const DEFAULT_CONTEXT_LIMIT = 128_000;

const SORTED_CONTEXT_LIMITS = Object.entries(MODEL_CONTEXT_LIMITS).sort(
  ([a], [b]) => b.length - a.length,
);

export function getModelContextLimit(model: string): number {
  const normalized = normalizeModelId(model);
  return (
    SORTED_CONTEXT_LIMITS.find(([key]) => normalized.includes(key))?.[1] ??
    DEFAULT_CONTEXT_LIMIT
  );
}
