export type SwarmReasoningMode = "off" | "low" | "medium" | "high";

export interface SwarmModelPreset {
  label: string;
  provider: string;
  model: string;
  apiKey?: string;
  baseURL?: string;
  reasoningMode?: SwarmReasoningMode;
  isOrchestrator?: boolean;
}

const MAX_RACERS = 8;
const VALID_REASONING: Set<string> = new Set(["off", "low", "medium", "high"]);
const MODEL_ALIASES: Record<string, string> = {
  "claude-sonnet-4.6": "claude-sonnet-4-6",
  "claude-opus-4.6": "claude-opus-4-6",
  "claude-haiku-4.5": "claude-haiku-4-5",
  "claude-sonnet-4.5": "claude-sonnet-4-5",
  "claude-opus-4.5": "claude-opus-4-5",
  "claude-opus-4.1": "claude-opus-4-1",
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeReasoningMode(value: unknown): SwarmReasoningMode {
  const mode = asString(value).toLowerCase();
  return (VALID_REASONING.has(mode) ? mode : "off") as SwarmReasoningMode;
}

function normalizeModelId(model: unknown): string {
  const lower = asString(model);
  return MODEL_ALIASES[lower] ?? lower;
}

function sanitizePreset(preset: SwarmModelPreset, isOrchestrator: boolean): SwarmModelPreset {
  return {
    label: asString(preset.label),
    provider: asString(preset.provider),
    model: normalizeModelId(asString(preset.model)),
    apiKey: asString(preset.apiKey) || undefined,
    baseURL: asString(preset.baseURL) || undefined,
    reasoningMode: sanitizeReasoningMode(preset.reasoningMode),
    isOrchestrator,
  };
}

function parseFromPrefix(env: Record<string, string>, prefix: string, isOrchestrator: boolean): SwarmModelPreset | null {
  const label = asString(env[`${prefix}_NAME`]);
  const provider = asString(env[`${prefix}_PROVIDER`]);
  const model = normalizeModelId(asString(env[`${prefix}_MODEL`]));

  if (!label || !provider || !model) return null;

  return {
    label,
    provider,
    model,
    apiKey: asString(env[`${prefix}_API_KEY`]) || undefined,
    baseURL: asString(env[`${prefix}_BASE_URL`]) || undefined,
    reasoningMode: sanitizeReasoningMode(env[`${prefix}_REASONING_MODE`]),
    isOrchestrator,
  };
}

export function readSwarmModelsFromEnv(env: Record<string, string>): SwarmModelPreset[] {
  const models: SwarmModelPreset[] = [];
  let orchestrator = parseFromPrefix(env, "ORCHESTRATOR", true);
  if (!orchestrator) return models;
  if (orchestrator) models.push(orchestrator);

  for (let i = 1; i <= MAX_RACERS; i++) {
    const racer = parseFromPrefix(env, `RACER_${i}`, false);
    if (!racer) continue;
    models.push(racer);
  }

  return models;
}

export function normalizeSwarmModelsInput(raw: unknown): SwarmModelPreset[] {
  if (!Array.isArray(raw)) return [];

  const normalized = raw
    .map((item, idx) => sanitizePreset((item || {}) as SwarmModelPreset, idx === 0))
    .filter((m) => m.label && m.provider && m.model);

  return normalized;
}

export function buildSwarmModelEnvUpdates(models: SwarmModelPreset[]): Record<string, string> {
  const updates: Record<string, string> = {};

  // Clear existing orchestrator + racer slots first.
  updates.ORCHESTRATOR_NAME = "";
  updates.ORCHESTRATOR_PROVIDER = "";
  updates.ORCHESTRATOR_MODEL = "";
  updates.ORCHESTRATOR_API_KEY = "";
  updates.ORCHESTRATOR_BASE_URL = "";
  updates.ORCHESTRATOR_REASONING_MODE = "off";

  for (let i = 1; i <= MAX_RACERS; i++) {
    updates[`RACER_${i}_NAME`] = "";
    updates[`RACER_${i}_PROVIDER`] = "";
    updates[`RACER_${i}_MODEL`] = "";
    updates[`RACER_${i}_API_KEY`] = "";
    updates[`RACER_${i}_BASE_URL`] = "";
    updates[`RACER_${i}_REASONING_MODE`] = "off";
  }

  if (models.length === 0) return updates;

  const orchestrator = sanitizePreset(models[0], true);
  updates.ORCHESTRATOR_NAME = orchestrator.label;
  updates.ORCHESTRATOR_PROVIDER = orchestrator.provider;
  updates.ORCHESTRATOR_MODEL = orchestrator.model;
  updates.ORCHESTRATOR_API_KEY = orchestrator.apiKey || "";
  updates.ORCHESTRATOR_BASE_URL = orchestrator.baseURL || "";
  updates.ORCHESTRATOR_REASONING_MODE = sanitizeReasoningMode(orchestrator.reasoningMode);

  const racers = models.slice(1, 1 + MAX_RACERS);
  racers.forEach((racerRaw, idx) => {
    const racer = sanitizePreset(racerRaw, false);
    const slot = idx + 1;
    updates[`RACER_${slot}_NAME`] = racer.label;
    updates[`RACER_${slot}_PROVIDER`] = racer.provider;
    updates[`RACER_${slot}_MODEL`] = racer.model;
    updates[`RACER_${slot}_API_KEY`] = racer.apiKey || "";
    updates[`RACER_${slot}_BASE_URL`] = racer.baseURL || "";
    updates[`RACER_${slot}_REASONING_MODE`] = sanitizeReasoningMode(racer.reasoningMode);
  });

  return updates;
}
