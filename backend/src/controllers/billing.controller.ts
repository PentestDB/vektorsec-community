import { Request, Response } from "express";
import {
  cancelSubscription,
  ensurePlanValid,
  getCurrentPlan,
  getOrCreateBilling,
  getPlanCatalog,
  redeemCoupon,
  resumeSubscription,
  rolloverCreditsIfNeeded,
  setUserPlan,
} from "../services/billing.service";
import User from "../models/User/User.model";
import { getPlan, isPlanId } from "../config/plans";

/**
 * GET /api/billing/plans
 * Public plan catalog for the pricing page.
 */
export async function getPlans(req: Request, res: Response) {
  try {
    const plans = await getPlanCatalog();
    return res.status(200).json({ plans });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to load plans" });
  }
}

/**
 * GET /api/billing/me
 * Current user's billing status + plan + usage.
 */
export async function getMyBilling(req: Request, res: Response) {
  try {
    const userId = res.locals.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // Roll over credits if the period has elapsed.
    await rolloverCreditsIfNeeded(userId);

    const plan = await ensurePlanValid(userId);
    const billing = await getOrCreateBilling(userId);
    const user = await User.findById(userId);

    const planDef = await getPlan(plan);

    return res.status(200).json({
      plan,
      planName: planDef.name,
      planPriceMonthly: planDef.priceMonthly,
      planPriceAnnual: planDef.priceAnnual,
      planFeatures: planDef.features,
      limits: planDef.limits,
      status: billing.status,
      interval: billing.interval,
      currentPeriodStart: billing.currentPeriodStart,
      currentPeriodEnd: billing.currentPeriodEnd,
      cancelAtPeriodEnd: billing.cancelAtPeriodEnd,
      planExpiresAt: user?.planExpiresAt,
      credits: user?.credits ?? 0,
      creditsUsed: user?.creditsUsed ?? 0,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to load billing" });
  }
}

/**
 * POST /api/billing/upgrade
 * Upgrade/downgrade the current user's plan.
 * Body: { plan: "pro" | "team" | "enterprise", interval?: "monthly" | "annual" }
 */
export async function upgradePlan(req: Request, res: Response) {
  try {
    const userId = res.locals.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { plan, interval } = req.body ?? {};
    if (!(await isPlanId(plan))) {
      return res.status(400).json({ message: "Invalid plan" });
    }
    if (plan === "free") {
      return res.status(400).json({ message: "Use cancel to downgrade to free" });
    }

    const billing = await setUserPlan(userId, plan, {
      interval: interval === "annual" ? "annual" : "monthly",
      actorId: userId,
      reason: "user_upgrade",
    });

    return res.status(200).json({
      message: `Plan upgraded to ${plan}`,
      billing,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to upgrade plan" });
  }
}

/**
 * POST /api/billing/cancel
 * Cancel the current user's subscription at period end.
 */
export async function cancelPlan(req: Request, res: Response) {
  try {
    const userId = res.locals.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const billing = await cancelSubscription(userId, userId);
    return res.status(200).json({
      message: "Subscription will be canceled at the end of the billing period",
      billing,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to cancel plan" });
  }
}

/**
 * POST /api/billing/resume
 * Resume a canceled subscription.
 */
export async function resumePlan(req: Request, res: Response) {
  try {
    const userId = res.locals.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const billing = await resumeSubscription(userId, userId);
    return res.status(200).json({
      message: "Subscription resumed",
      billing,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to resume plan" });
  }
}

/**
 * POST /api/billing/redeem-coupon
 * Redeem a coupon code to add credits.
 * Body: { coupon: "CODE" }
 */
export async function redeemCouponCode(req: Request, res: Response) {
  try {
    const userId = res.locals.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { coupon } = req.body ?? {};
    if (!coupon || typeof coupon !== "string") {
      return res.status(400).json({ message: "Coupon code is required" });
    }

    const result = await redeemCoupon(userId, coupon.trim().toUpperCase(), userId);
    return res.status(200).json({
      message: `Coupon redeemed! Added ${result.creditsAdded} credits.`,
      ...result,
    });
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || "Failed to redeem coupon" });
  }
}

/**
 * GET /api/billing/usage
 * Current usage vs plan limits.
 */
export async function getUsage(req: Request, res: Response) {
  try {
    const userId = res.locals.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const plan = await ensurePlanValid(userId);
    const planDef = await getPlan(plan);
    const user = await User.findById(userId);

    const Sessions = (await import("../models/Sessions/Sessions.model")).default;
    const Workspace = (await import("../models/Workspace/Workspace.model")).default;

    // Workspaces are owned by the user via `uid`.
    const userWorkspaces = await Workspace.find({ uid: userId }).select("workspaceId");
    const workspaceIds = userWorkspaces.map((w) => w.workspaceId);

    const [activeSessions, totalSessions, workspaces] = await Promise.all([
      Sessions.countDocuments({
        workspaceId: { $in: workspaceIds },
        status: "active",
      }),
      Sessions.countDocuments({ workspaceId: { $in: workspaceIds } }),
      userWorkspaces.length,
    ]);



    return res.status(200).json({
      plan,
      usage: {
        concurrentSessions: {
          current: activeSessions,
          limit: planDef.limits.maxConcurrentSessions,
        },
        sessionsPerPeriod: {
          current: totalSessions,
          limit: planDef.limits.maxSessionsPerPeriod,
        },
        workspaces: {
          current: workspaces,
          limit: planDef.limits.maxWorkspaces,
        },
        mcpTokens: {
          current: (user?.configs?.mcpTokens ?? []).length,
          limit: planDef.limits.maxMcpTokens,
        },
        credits: {
          current: user?.credits ?? 0,
          used: user?.creditsUsed ?? 0,
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to load usage" });
  }
}
