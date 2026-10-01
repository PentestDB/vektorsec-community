import type { ExecutionContext, ToolResult } from "../types";
import { assertTargetIsExternal, blockedTargetResult } from "../../utils/ssrfGuard";
import { validateCommandScope, createDefaultScopeConfig } from "../../utils/scopeValidator";

/**
 * Shared pre-execution guard for scanner handlers:
 *  1. SSRF guard — target must resolve to public addresses only.
 *  2. Scope allowlist — target must be inside the workspace scope (or the
 *     global Admin > Scope config when the workspace scope is disabled).
 *
 * Returns `null` when safe to run, otherwise a blocked ToolResult.
 */
export async function guardScanTarget(
  ctx: ExecutionContext,
  target: string,
): Promise<ToolResult | null> {
  if (!target || !target.trim()) {
    return { output: "Error: a target is required", exitCode: 1 };
  }

  try {
    await assertTargetIsExternal(target.trim());
  } catch {
    return blockedTargetResult();
  }

  const scopeConfig = ctx.guardrails?.scope ?? createDefaultScopeConfig();
  const scopeResult = validateCommandScope(target.trim(), scopeConfig);
  if (!scopeResult.allowed) {
    return { output: `BLOCKED: ${scopeResult.reason}`, exitCode: 1 };
  }

  return null;
}

/** Pretty-print a structured scan result for the model. */
export function serializeScanResult(result: unknown): string {
  return JSON.stringify(result, null, 2);
}
