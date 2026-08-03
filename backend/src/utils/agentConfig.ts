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
