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

// ─── Workspace-level max turns ─────────────────────────────────────
// Turn limit configurable per workspace (Workspace Settings). Unlike the
// global user setting (5..200), the workspace level is intentionally a small
// set of presets so a workspace can enforce a sane ceiling for its sessions.
export const WORKSPACE_MAX_TURNS_CHOICES = [25, 50, 100] as const;
export const DEFAULT_WORKSPACE_MAX_TURNS = 25;

/**
 * Normalize a workspace `maxTurns` value.
 *
 * - `undefined` / `null` / `""`  -> `undefined` (workspace unset: fall back to
 *   the user-level maxAgentIterations).
 * - anything that is not one of WORKSPACE_MAX_TURNS_CHOICES -> 25 (default).
 */
export function normalizeWorkspaceMaxTurns(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  const rounded = Math.round(parsed);
  if ((WORKSPACE_MAX_TURNS_CHOICES as readonly number[]).includes(rounded)) {
    return rounded;
  }
  return DEFAULT_WORKSPACE_MAX_TURNS;
}


