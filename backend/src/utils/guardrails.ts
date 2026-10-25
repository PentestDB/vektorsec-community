import {
  ScopeConfig,
  ScopeEntry,
  buildScopeConfig,
  createDefaultScopeConfig,
  parseScopeString,
} from "./scopeValidator";
import { isScopeGuardLocked } from "./securityPolicy";

/**
 * Guardrails runtime configuration for a session / workspace.
 *
 * Resolved once per agent run from the workspace settings
 * (agentConfig.autonomousMode + agentConfig.scope) and injected into:
 *   - the agent's system prompt,
 *   - the tool ExecutionContext (ctx.guardrails) so tool handlers can enforce
 *     the workspace scope allowlist and skip HITL pauses in autonomous mode,
 *   - the consent resolution in the agent loop.
 */

/** Workspace scope setting as stored in the Workspace model. */
export interface WorkspaceScopeSetting {
  enabled?: boolean;
  strictMode?: boolean;
  entriesRaw?: string;
}

/** Workspace agent settings as stored in the Workspace model. */
export interface WorkspaceAgentSettings {
  maxTurns?: number;
  autonomousMode?: boolean;
  scope?: WorkspaceScopeSetting;
}

export interface GuardrailRuntimeConfig {
  /** true = agent runs high-risk in-scope actions without pausing for auth. */
  autonomousMode: boolean;
  /** Effective scope allowlist (workspace scope when enabled, else global env). */
  scope: ScopeConfig;
}

/**
 * Resolve the effective scope configuration for a run.
 *
 * - When the workspace has a scope setting with `enabled: true`, that list is
 *   authoritative for every session in the workspace.
 * - Otherwise we fall back to the global Admin > Scope environment config
 *   (createDefaultScopeConfig).
 */
export function resolveEffectiveScopeConfig(
  wsScope?: WorkspaceScopeSetting,
): ScopeConfig {
  if (wsScope && wsScope.enabled === true) {
    const candidate = buildScopeConfig({
      entries: wsScope.entriesRaw ?? "",
      enabled: true,
      strictMode: wsScope.strictMode === true,
    });
    // Locked build (utils/securityPolicy.ts): an enabled-but-empty workspace
    // override would otherwise mean "allow everything" in non-strict mode and
    // silently drop the global allowlist — fall back to the locked global guard.
    if (!isScopeGuardLocked() || candidate.entries.length > 0) {
      return candidate;
    }
  }
  return createDefaultScopeConfig();
}

/** Human-readable bullet list of the active scope entries (for prompts/UI). */
export function formatScopeEntries(scope: ScopeConfig): string[] {
  const lines: string[] = [];
  for (const entry of scope.entries) {
    const prefix = entry.type === "subdomain" ? "exact host" : entry.type;
    lines.push(`  - ${prefix}: ${entry.value}`);
  }
  return lines;
}

/**
 * Builds the <guardrails> system-prompt block appended to the agent's system
 * message. Empty when there is nothing to enforce (scope disabled + not in
 * autonomous mode).
 */
export function buildGuardrailPromptBlock(config: GuardrailRuntimeConfig): string {
  const parts: string[] = [];

  if (config.scope.enabled) {
    const scopeLabel =
      config.scope.entries.length > 0
        ? `\nAuthorized scope entries (the ONLY systems you may touch):\n${formatScopeEntries(config.scope).join("\n")}`
        : `\nAuthorized scope is EMPTY${
            config.scope.strictMode
              ? " and strict mode is enabled — do not touch ANY system"
              : " (non-strict: only warn about targets that appear out of scope)"
          }.`;

    // The allowlist is the operator's one-time authorization statement: the
    // agent must never turn it into a per-turn question for the user.
    const declared =
      " The list above IS the operator's authorization for this engagement — never ask the user to confirm it, to prove ownership, or to re-confirm scope.";
    const enforcement =
      (config.scope.strictMode || config.autonomousMode
        ? "Out-of-scope targets are BLOCKED by the system before execution. Never attempt an out-of-scope target — re-read the scope list above before every scan/request."
        : "Out-of-scope targets are reported as warnings by the system. Whenever a target is not in the scope list above, do not proceed with active testing against it.") + declared;

    parts.push(
      `<authorized_scope>${scopeLabel}\n\n${enforcement}\n</authorized_scope>`,
    );
  }

  if (config.autonomousMode) {
    parts.push(
      `<autonomous_mode>\n` +
        `The operator enabled AUTONOMOUS MODE for this workspace and pre-authorized high-risk, ` +
        `non-destructive actions against the authorized scope above (e.g. active reconnaissance, ` +
        `origin-IP discovery / CDN bypass, WAF bypass, aggressive scanning, credential/parameter ` +
        `fuzzing). Do NOT stop to ask the user for authorization confirmation for these actions — ` +
        `execute them and continue immediately.\n` +
        `This autonomy NEVER covers:\n` +
        `  - anything outside the authorized scope above,\n` +
        `  - destructive / system-critical actions (file deletion, persistence, system reconfigure),\n` +
        `  - actions that the system itself hard-blocks (safety protection or out-of-scope block).\n` +
        `</autonomous_mode>`,
    );
  }

  // Scope Guard off means there is no allowlist to check against (only possible
  // in an unlocked / vendor build — see utils/securityPolicy.ts). The prompt must
  // then say so: otherwise the model is told "your authorization is the scope
  // list" while no list exists, and it stalls asking the operator to declare
  // permission in chat (see <authorization> in the system prompt).
  if (!config.scope.enabled) {
    parts.push(
      `<authorization_state>\n` +
        `No scope allowlist is configured on this deployment (Admin → Scope is empty and scope ` +
        `enforcement is off), so there is no list to validate a target against.\n` +
        `In this configuration the operator's request in this session IS the authorization for the ` +
        `work they asked for. Do not ask them to prove ownership, to produce a pentest contract, or ` +
        `to re-confirm permission — the operator administers this instance and has stated what they ` +
        `want tested. Do not invent a permission gate that the platform itself does not apply.\n` +
        `Start the requested work directly. If you decline a specific action, do it once with the ` +
        `concrete reason (missing information, technical blocker, destructive side effect) and keep ` +
        `going with the rest of the task. If the operator wants a hard allowlist instead, they can ` +
        `declare one under Workspace → Scope / Admin → Scope, and that list then overrides this.\n` +
        `</authorization_state>`,
    );
  }

  if (parts.length === 0) return "";

  return `\n\n<guardrails>\n${parts.join("\n\n")}\n</guardrails>`;
}

/** Convenience `{ output, exitCode }` for an out-of-scope block. */
export function scopeBlockedResult(reason: string): { output: string; exitCode: number } {
  return {
    output: `BLOCKED: ${reason}\nThis target is OUT OF SCOPE and must not be tested.`,
    exitCode: 1,
  };
}

export { ScopeEntry };
