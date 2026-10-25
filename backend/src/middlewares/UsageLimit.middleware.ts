import { Request, Response, NextFunction } from "express";
import { getPlan } from "../config/plans";
import User from "../models/User/User.model";
import Sessions from "../models/Sessions/Sessions.model";
import Workspace from "../models/Workspace/Workspace.model";
import { getEffectivePlanId } from "../services/subscription.service";



/**
 * Usage-limit middleware.
 *
 * Enforces plan-based limits on a user's usage of the platform. Attach to
 * routes that create or consume billable resources (sessions, workspaces,
 * MCP tokens, etc.).
 *
 * Usage:
 *   router.post("/create", [verifySess, enforceUsageLimit("sessions")], handler);
 */

export type UsageResource =
  | "sessions"
  | "concurrent_sessions"
  | "workspaces"
  | "mcp_tokens"
  | "agent_iterations";

/** Plan limits this middleware understands (see `config/plans.ts`). */
export interface UsageLimits {
  maxConcurrentSessions: number;
  maxSessionsPerPeriod: number;
  maxWorkspaces: number;
  maxMcpTokens: number;
}

/** Resource usage counted from the database for one user. */
export interface UsageCounts {
  workspaces: number;
  concurrentSessions: number;
  sessionsThisPeriod: number;
  mcpTokens: number;
}

export interface UsageLimitViolation {
  code: string;
  message: string;
  limit: number;
  current: number;
}

export interface UsageLimitContext {
  /** Per-user override of the plan's MCP token limit. */
  maxMcpTokensOverride?: number;
}

/**
 * A limit of `0` (or a negative / non-finite value) means "unlimited", matching
 * the documented convention of `maxSessionsPerPeriod` in `config/plans.ts`.
 */
function isUnlimited(limit: number): boolean {
  return !Number.isFinite(limit) || limit <= 0;
}

/**
 * Pure plan-limit evaluation (no I/O, hence unit-testable).
 *
 * Returns `null` when the resource may be used, otherwise the blocking
 * violation with the limit and the current usage.
 */
export function evaluateUsageLimit(
  resource: UsageResource,
  limits: UsageLimits,
  counts: UsageCounts,
  ctx: UsageLimitContext = {},
): UsageLimitViolation | null {
  switch (resource) {
    case "concurrent_sessions": {
      const limit = limits.maxConcurrentSessions;
      if (isUnlimited(limit) || counts.concurrentSessions < limit) return null;
      return {
        code: "PLAN_LIMIT_CONCURRENT_SESSIONS",
        message: `Concurrent session limit reached (${limit}). Upgrade your plan to run more sessions in parallel.`,
        limit,
        current: counts.concurrentSessions,
      };
    }

    case "sessions": {
      const limit = limits.maxSessionsPerPeriod;
      if (isUnlimited(limit) || counts.sessionsThisPeriod < limit) return null;
      return {
        code: "PLAN_LIMIT_SESSIONS",
        message: `Session limit reached for this period (${limit}). Upgrade your plan for unlimited sessions.`,
        limit,
        current: counts.sessionsThisPeriod,
      };
    }

    case "workspaces": {
      const limit = limits.maxWorkspaces;
      if (isUnlimited(limit) || counts.workspaces < limit) return null;
      return {
        code: "PLAN_LIMIT_WORKSPACES",
        message: `Workspace limit reached (${limit}). Upgrade your plan for more workspaces.`,
        limit,
        current: counts.workspaces,
      };
    }

    case "mcp_tokens": {
      // Admin override wins over the plan limit (same rule as before).
      const limit = ctx.maxMcpTokensOverride ?? limits.maxMcpTokens;
      if (isUnlimited(limit) || counts.mcpTokens < limit) return null;
      return {
        code: "PLAN_LIMIT_MCP_TOKENS",
        message: `MCP token limit reached (${limit}). Upgrade your plan for more MCP tokens.`,
        limit,
        current: counts.mcpTokens,
      };
    }

    case "agent_iterations":
      // Enforced inside the agent loop; the middleware only exposes the limit.
      return null;

    default:
      return null;
  }
}


/**
 * Middleware factory that enforces one or more plan limits before a route
 * creates a billable resource.
 *
 * Usage:
 *   router.post("/create-session", [verifySess, enforceUsageLimit(["concurrent_sessions", "sessions"])], handler);
 *
 * Responds `403` with `{ code, limit, current }` when a limit is hit, and
 * exposes `res.locals.plan` / `res.locals.planLimits` for downstream handlers.
 */
export function enforceUsageLimit(
  resource: UsageResource | UsageResource[],
  message?: string,
) {
  const resources: UsageResource[] = Array.isArray(resource) ? resource : [resource];

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = res.locals.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Admins bypass usage limits.
      if (user.role === "admin") {
        return next();
      }

      // Determine the effective plan from the user's active subscription/trial
      // on the platform channel (falls back to the user's base plan).
      const effectivePlanId = await getEffectivePlanId(userId, "platform");
      const plan = await getPlan(effectivePlanId);
      const limit = plan.limits;

      // Only count what the requested resources actually need, so a single
      // create costs one or two COUNT queries instead of four.
      const needs = (r: UsageResource) => resources.includes(r);
      const counts: UsageCounts = {
        workspaces: 0,
        concurrentSessions: 0,
        sessionsThisPeriod: 0,
        mcpTokens: 0,
      };

      if (needs("workspaces") || needs("concurrent_sessions") || needs("sessions")) {
        // Workspaces are owned by the user via `uid`.
        counts.workspaces = await Workspace.countDocuments({ uid: userId });
      }

      if (needs("concurrent_sessions")) {
        counts.concurrentSessions = await Sessions.countDocuments({
          uid: userId,
          status: "active",
        });
      }

      if (needs("sessions") && limit.maxSessionsPerPeriod > 0) {
        const periodStart = user.creditsPeriodStart ?? new Date(0);
        counts.sessionsThisPeriod = await Sessions.countDocuments({
          uid: userId,
          createdAt: { $gte: periodStart },
        });
      }

      if (needs("mcp_tokens")) {
        // Revoked tokens are kept for auditing — they must not count as usage.
        counts.mcpTokens = (user.configs?.mcpTokens ?? []).filter((t) => !t.revokedAt).length;
      }

      for (const resourceName of resources) {
        const violation = evaluateUsageLimit(resourceName, limit, counts, {
          maxMcpTokensOverride: user.mcpTokenLimit,
        });
        if (violation) {
          return res.status(403).json({
            message: message ?? violation.message,
            code: violation.code,
            limit: violation.limit,
            current: violation.current,
          });
        }
      }

      // Expose plan limits to downstream handlers.
      res.locals.plan = plan;
      res.locals.planLimits = limit;
      next();
    } catch (error) {
      console.error("[usage-limit] error:", error);
      return res.status(500).json({ message: "Failed to check usage limit" });
    }
  };
}

/**
 * Convenience middleware that attaches the user's plan + limits to res.locals
 * without enforcing any hard limit. Useful for read-only routes that need to
 * know the plan for UI gating.
 */
export async function attachPlanInfo(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = res.locals.userId;
    if (userId) {
      const user = await User.findById(userId);
      if (user) {
        // Use the effective plan from the active subscription/trial on the
        // platform channel (falls back to the user's base plan).
        const effectivePlanId = await getEffectivePlanId(userId, "platform");
        const plan = await getPlan(effectivePlanId);
        res.locals.plan = plan;
        res.locals.planLimits = plan.limits;
        res.locals.userPlan = effectivePlanId;
      }
    }
    next();

  } catch (error) {
    console.error("[attach-plan-info] error:", error);
    next();
  }
}
