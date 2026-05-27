import fs from "fs";
import path from "path";
import { deleteEnvVars, readEnvFile } from "./envWriter";
import { getDataDir } from "./loadConfig";

export type ModelReasoningMode = "off" | "low" | "medium" | "high" | "xhigh";

export interface ModelPreset {
  id: string;
  label: string;
  provider: string;
  model: string;
  apiKey?: string;
  baseURL?: string;
  reasoningMode?: ModelReasoningMode;
}

export interface ModelAssignments {
  orchestratorModelId?: string;
  racerModelIds: string[];
  browserModelId?: string;
}

export interface ModelRegistry {
  models: ModelPreset[];
  assignments: ModelAssignments;
}

const LEGACY_MODEL_KEYS = [
  "MODEL_PRESETS_JSON",
  "MODEL_ASSIGNMENTS_JSON",
  "ORCHESTRATOR_NAME",
  "ORCHESTRATOR_PROVIDER",
  "ORCHESTRATOR_MODEL",
  "ORCHESTRATOR_API_KEY",
  "ORCHESTRATOR_BASE_URL",
  "ORCHESTRATOR_REASONING_MODE",
  "MAGNITUDE_MODEL_PROVIDER",
  "MAGNITUDE_MODEL",
  "MAGNITUDE_MODEL_API_KEY",
  "MAGNITUDE_MODEL_BASE_URL",
  ...Array.from({ length: 8 }, (_, i) => i + 1).flatMap((idx) => [
    `RACER_${idx}_NAME`,
    `RACER_${idx}_PROVIDER`,
    `RACER_${idx}_MODEL`,
    `RACER_${idx}_API_KEY`,
    `RACER_${idx}_BASE_URL`,
    `RACER_${idx}_REASONING_MODE`,
  ]),
];

const VALID_PROVIDERS = new Set([
  "openai",
  "anthropic",
  "anthropic-compatible",
  "openrouter",
  "google",
  "mistralai",
  "ollama",
  "openai-compatible",
]);

const VALID_REASONING = new Set(["off", "low", "medium", "high", "xhigh"]);

const MODEL_ALIASES: Record<string, string> = {
  "gpt-5.5-latest": "gpt-5.5",
  "gpt-5.4-latest": "gpt-5.4",
  "claude-opus-4.7": "claude-opus-4-7",
  "claude-mythos": "claude-mythos-preview",
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

function normalizeModelId(model: unknown): string {
  const trimmed = asString(model);
  return MODEL_ALIASES[trimmed] ?? trimmed;
}

function normalizeReasoning(value: unknown): ModelReasoningMode {
  const mode = asString(value).toLowerCase();
  return (VALID_REASONING.has(mode) ? mode : "off") as ModelReasoningMode;
}

function parseJson<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;

  const candidates = [
    value,
    value.replace(/\\"/g, '"').replace(/\\\\/g, "\\"),
  ];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === "string") {
        return JSON.parse(parsed) as T;
      }
      return parsed as T;
    } catch {
      // Try the next representation. Some .env values are stored as escaped
      // JSON strings because the env writer quotes every value.
    }
  }

  return fallback;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function createId(label: string, used: Set<string>): string {
  const base = slugify(label) || "model";
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix++}`;
  }
  used.add(candidate);
  return candidate;
}

function sanitizePreset(
  raw: Partial<ModelPreset>,
  usedIds: Set<string>,
): ModelPreset | null {
  const label = asString(raw.label);
  const provider = asString(raw.provider);
  const model = normalizeModelId(raw.model);
  if (!label || !VALID_PROVIDERS.has(provider) || !model) return null;

  const requestedId = slugify(asString(raw.id));
  const id =
    requestedId && !usedIds.has(requestedId)
      ? requestedId
      : createId(label, usedIds);
  usedIds.add(id);

  return {
    id,
    label,
    provider,
    model,
    apiKey: asString(raw.apiKey) || undefined,
    baseURL: asString(raw.baseURL) || undefined,
    reasoningMode: normalizeReasoning(raw.reasoningMode),
  };
}

function sanitizeAssignments(
  raw: Partial<ModelAssignments>,
  models: ModelPreset[],
): ModelAssignments {
  const ids = new Set(models.map((model) => model.id));
  const orchestratorModelId = ids.has(asString(raw.orchestratorModelId))
    ? asString(raw.orchestratorModelId)
    : models[0]?.id;
  const browserModelId = ids.has(asString(raw.browserModelId))
    ? asString(raw.browserModelId)
    : undefined;
  const racerModelIds = Array.isArray(raw.racerModelIds)
    ? raw.racerModelIds.map(asString).filter((id) => ids.has(id))
    : [];

  return {
    orchestratorModelId,
    racerModelIds: Array.from(new Set(racerModelIds)),
    browserModelId,
  };
}

function legacyPresetKey(
  preset: Pick<ModelPreset, "provider" | "model" | "apiKey" | "baseURL">,
): string {
  return [
    preset.provider,
    preset.model,
    preset.apiKey || "",
    preset.baseURL || "",
  ].join("\u0000");
}

function addLegacyPreset(
  models: ModelPreset[],
  usedIds: Set<string>,
  dedupe: Map<string, string>,
  raw: Omit<ModelPreset, "id">,
): string | null {
  const preset = sanitizePreset({ ...raw }, usedIds);
  if (!preset) return null;

  const key = legacyPresetKey(preset);
  const existingId = dedupe.get(key);
  if (existingId) return existingId;

  models.push(preset);
  dedupe.set(key, preset.id);
  return preset.id;
}

function hasLegacyModelConfig(env: Record<string, string>): boolean {
  return Boolean(
    env.ORCHESTRATOR_PROVIDER ||
    env.ORCHESTRATOR_MODEL ||
    env.ORCHESTRATOR_API_KEY ||
    env.MAGNITUDE_MODEL_PROVIDER ||
    env.MAGNITUDE_MODEL ||
    env.MAGNITUDE_MODEL_API_KEY ||
    Array.from({ length: 8 }, (_, i) => i + 1).some(
      (idx) =>
        env[`RACER_${idx}_PROVIDER`] ||
        env[`RACER_${idx}_MODEL`] ||
        env[`RACER_${idx}_API_KEY`],
    ),
  );
}

function migrateLegacyModelConfig(env: Record<string, string>): ModelRegistry {
  const models: ModelPreset[] = [];
  const assignments: ModelAssignments = { racerModelIds: [] };
  const usedIds = new Set<string>();
  const dedupe = new Map<string, string>();

  const orchestratorId = addLegacyPreset(models, usedIds, dedupe, {
    label: asString(env.ORCHESTRATOR_NAME) || "Orchestrator",
    provider: asString(env.ORCHESTRATOR_PROVIDER),
    model: normalizeModelId(env.ORCHESTRATOR_MODEL),
    apiKey: asString(env.ORCHESTRATOR_API_KEY) || undefined,
    baseURL: asString(env.ORCHESTRATOR_BASE_URL) || undefined,
    reasoningMode: normalizeReasoning(env.ORCHESTRATOR_REASONING_MODE),
  });
  if (orchestratorId) assignments.orchestratorModelId = orchestratorId;

  for (let i = 1; i <= 8; i += 1) {
    const racerId = addLegacyPreset(models, usedIds, dedupe, {
      label: asString(env[`RACER_${i}_NAME`]) || `Racer ${i}`,
      provider: asString(env[`RACER_${i}_PROVIDER`]),
      model: normalizeModelId(env[`RACER_${i}_MODEL`]),
      apiKey: asString(env[`RACER_${i}_API_KEY`]) || undefined,
      baseURL: asString(env[`RACER_${i}_BASE_URL`]) || undefined,
      reasoningMode: normalizeReasoning(env[`RACER_${i}_REASONING_MODE`]),
    });
    if (racerId) assignments.racerModelIds.push(racerId);
  }

  const browserId = addLegacyPreset(models, usedIds, dedupe, {
    label: "Browser Agent",
    provider: asString(env.MAGNITUDE_MODEL_PROVIDER),
    model: normalizeModelId(env.MAGNITUDE_MODEL),
    apiKey: asString(env.MAGNITUDE_MODEL_API_KEY) || undefined,
    baseURL: asString(env.MAGNITUDE_MODEL_BASE_URL) || undefined,
    reasoningMode: "off",
  });
  if (browserId) assignments.browserModelId = browserId;

  if (!assignments.orchestratorModelId && models[0]) {
    assignments.orchestratorModelId = models[0].id;
  }

  return { models, assignments: sanitizeAssignments(assignments, models) };
}

export function getModelRegistryPath(): string {
  return path.join(getDataDir(), "model-registry.json");
}

function emptyRegistry(): ModelRegistry {
  return { models: [], assignments: { racerModelIds: [] } };
}

function readProfileRegistry(): ModelRegistry | null {
  const profilePath = getModelRegistryPath();
  if (!fs.existsSync(profilePath)) return null;

  try {
    const raw = fs.readFileSync(profilePath, "utf-8");
    if (!raw.trim()) return emptyRegistry();
    const parsed = JSON.parse(raw) as Partial<ModelRegistry>;
    return normalizeModelRegistryInput(
      Array.isArray(parsed.models) ? parsed.models : [],
      parsed.assignments || {},
    );
  } catch (error) {
    console.warn("[modelRegistry] Failed to parse model registry profile:", error);
    return emptyRegistry();
  }
}

function writeProfileRegistry(registry: ModelRegistry): void {
  const profilePath = getModelRegistryPath();
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(`${profilePath}.tmp`, `${JSON.stringify(registry, null, 2)}\n`, "utf-8");
  fs.renameSync(`${profilePath}.tmp`, profilePath);
}

function registryFromEnvJson(env: Record<string, string>): ModelRegistry {
  const usedIds = new Set<string>();
  const models = parseJson<Partial<ModelPreset>[]>(env.MODEL_PRESETS_JSON, [])
    .map((preset) => sanitizePreset(preset, usedIds))
    .filter((preset): preset is ModelPreset => Boolean(preset));
  const assignments = sanitizeAssignments(
    parseJson<Partial<ModelAssignments>>(env.MODEL_ASSIGNMENTS_JSON, {}),
    models,
  );
  return { models, assignments };
}

function hasEnvJsonRegistry(env: Record<string, string>): boolean {
  return Boolean(env.MODEL_PRESETS_JSON || env.MODEL_ASSIGNMENTS_JSON);
}

function migrateEnvRegistryIfPresent(env: Record<string, string>): ModelRegistry | null {
  if (hasEnvJsonRegistry(env)) {
    const migrated = registryFromEnvJson(env);
    writeProfileRegistry(migrated);
    deleteEnvVars(LEGACY_MODEL_KEYS);
    return migrated;
  }

  if (hasLegacyModelConfig(env)) {
    const migrated = migrateLegacyModelConfig(env);
    writeProfileRegistry(migrated);
    deleteEnvVars(LEGACY_MODEL_KEYS);
    return migrated;
  }

  return null;
}

export function readModelRegistry(): ModelRegistry {
  const env = readEnvFile();
  const profile = readProfileRegistry();
  if (
    profile &&
    (profile.models.length > 0 ||
      (!hasEnvJsonRegistry(env) && !hasLegacyModelConfig(env)))
  ) {
    return profile;
  }

  const migrated = migrateEnvRegistryIfPresent(env);
  if (migrated) return migrated;

  return profile || emptyRegistry();
}

export function writeModelRegistry(
  modelsInput: Partial<ModelPreset>[],
  assignmentsInput: Partial<ModelAssignments>,
  blankLegacy = true,
): ModelRegistry {
  const { models, assignments } = normalizeModelRegistryInput(
    modelsInput,
    assignmentsInput,
  );
  const registry = { models, assignments };
  writeProfileRegistry(registry);
  if (blankLegacy) deleteEnvVars(LEGACY_MODEL_KEYS);
  return registry;
}

export function normalizeModelRegistryInput(
  modelsInput: Partial<ModelPreset>[],
  assignmentsInput: Partial<ModelAssignments>,
): ModelRegistry {
  const usedIds = new Set<string>();
  const models = modelsInput
    .map((preset) => sanitizePreset(preset, usedIds))
    .filter((preset): preset is ModelPreset => Boolean(preset));
  const assignments = sanitizeAssignments(assignmentsInput, models);
  return { models, assignments };
}

export function resolveAssignedModel(
  registry: ModelRegistry,
  id: string | undefined,
): ModelPreset | null {
  if (!id) return null;
  return registry.models.find((model) => model.id === id) || null;
}

export function getAssignedModels(): {
  orchestrator: ModelPreset | null;
  racers: ModelPreset[];
  browser: ModelPreset | null;
  all: ModelPreset[];
  assignments: ModelAssignments;
} {
  const registry = readModelRegistry();
  return {
    orchestrator: resolveAssignedModel(
      registry,
      registry.assignments.orchestratorModelId,
    ),
    racers: registry.assignments.racerModelIds
      .map((id) => resolveAssignedModel(registry, id))
      .filter((model): model is ModelPreset => Boolean(model)),
    browser: resolveAssignedModel(
      registry,
      registry.assignments.browserModelId,
    ),
    all: registry.models,
    assignments: registry.assignments,
  };
}
