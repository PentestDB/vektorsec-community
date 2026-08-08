export const DEFAULT_MAX_AGENT_ITERATIONS = 25;
export const MIN_MAX_AGENT_ITERATIONS = 5;
export const MAX_MAX_AGENT_ITERATIONS = 200;

export function normalizeMaxAgentIterations(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_AGENT_ITERATIONS;
  return Math.min(
    MAX_MAX_AGENT_ITERATIONS,
    Math.max(MIN_MAX_AGENT_ITERATIONS, Math.round(parsed)),
  );
}

// ─── Subagent iteration limit ───────────────────────────────────────
export const DEFAULT_MAX_SUBAGENT_ITERATIONS = 15;
export const MIN_MAX_SUBAGENT_ITERATIONS = 3;
export const MAX_MAX_SUBAGENT_ITERATIONS = 100;

export function normalizeMaxSubagentIterations(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_SUBAGENT_ITERATIONS;
  return Math.min(
    MAX_MAX_SUBAGENT_ITERATIONS,
    Math.max(MIN_MAX_SUBAGENT_ITERATIONS, Math.round(parsed)),
  );
}

// ─── Swarm racer iteration limit ────────────────────────────────────
export const DEFAULT_MAX_SWARM_ITERATIONS = 25;
export const MIN_MAX_SWARM_ITERATIONS = 5;
export const MAX_MAX_SWARM_ITERATIONS = 150;

export function normalizeMaxSwarmIterations(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_SWARM_ITERATIONS;
  return Math.min(
    MAX_MAX_SWARM_ITERATIONS,
    Math.max(MIN_MAX_SWARM_ITERATIONS, Math.round(parsed)),
  );
}


