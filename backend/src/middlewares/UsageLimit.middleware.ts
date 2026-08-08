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

interface UsageCheck {
  resource: UsageResource;
  /** Optional custom error message. */
  message?: string;
}

/**
 * Middleware factory that enforces a plan limit for a given resource.
 */
export function enforceUsageLimit(resource: UsageResource, message?: string) {
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


      // Workspaces are owned by the user via `uid`.
      const userWorkspaces = await Workspace.find({ uid: userId }).select("workspaceId");
      const workspaceIds = userWorkspaces.map((w) => w.workspaceId);

      switch (resource) {
        case "concurrent_sessions": {
          const activeCount = await Sessions.countDocuments({
            workspaceId: { $in: workspaceIds },
            status: "active",
          });
          if (activeCount >= limit.maxConcurrentSessions) {
            return res.status(403).json({
              message:
                message ??
                `Concurrent session limit reached (${limit.maxConcurrentSessions}). Upgrade your plan to run more sessions in parallel.`,
              code: "PLAN_LIMIT_CONCURRENT_SESSIONS",
              limit: limit.maxConcurrentSessions,
              current: activeCount,
            });
          }
          break;
        }

        case "sessions": {
          if (limit.maxSessionsPerPeriod > 0) {
            const periodStart = user.creditsPeriodStart ?? new Date(0);
            const periodCount = await Sessions.countDocuments({
              workspaceId: { $in: workspaceIds },
              createdAt: { $gte: periodStart },
            });
            if (periodCount >= limit.maxSessionsPerPeriod) {
              return res.status(403).json({
                message:
                  message ??
                  `Session limit reached for this period (${limit.maxSessionsPerPeriod}). Upgrade your plan for unlimited sessions.`,
                code: "PLAN_LIMIT_SESSIONS",
                limit: limit.maxSessionsPerPeriod,
                current: periodCount,
              });
            }
          }
          break;
        }

        case "workspaces": {
          const workspaceCount = userWorkspaces.length;
          if (workspaceCount >= limit.maxWorkspaces) {
            return res.status(403).json({
              message:
                message ??
                `Workspace limit reached (${limit.maxWorkspaces}). Upgrade your plan for more workspaces.`,
              code: "PLAN_LIMIT_WORKSPACES",
              limit: limit.maxWorkspaces,
              current: workspaceCount,
            });
          }
          break;
        }


        case "mcp_tokens": {
          const tokenCount = (user.configs?.mcpTokens ?? []).length;
          // Admin override: if mcpTokenLimit is set on the user, use it instead of the plan limit.
          const maxTokens = user.mcpTokenLimit ?? limit.maxMcpTokens;
          if (tokenCount >= maxTokens) {
            return res.status(403).json({
              message:
                message ??
                `MCP token limit reached (${maxTokens}). Upgrade your plan for more MCP tokens.`,
              code: "PLAN_LIMIT_MCP_TOKENS",
              limit: maxTokens,
              current: tokenCount,
            });
          }
          break;
        }


        case "agent_iterations": {
          // This is enforced at the agent level; here we just expose the limit.
          res.locals.planLimits = limit;
          break;
        }

        default:
          break;
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
