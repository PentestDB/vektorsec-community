import Billing, { BillingDoc, BillingInterval, BillingStatus } from "../models/Billing/Billing.model";
import User from "../models/User/User.model";
import { getPlan, isPlanId, PlanId, getPlanCatalog as getPlanCatalogFromConfig } from "../config/plans";
import { logAudit } from "./audit.service";
import { getEffectivePlanId } from "./subscription.service";


/**
 * Billing service.
 *
 * Manages a user's plan/subscription lifecycle. Stripe integration is
 * intentionally decoupled: the service exposes a clean interface that can be
 * backed by Stripe webhooks later without changing callers.
 */

const PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Get (or lazily create) the billing record for a user.
 */
export async function getOrCreateBilling(userId: string): Promise<BillingDoc> {
  let billing = await Billing.findOne({ userId });
  if (!billing) {
    const user = await User.findById(userId);
    const plan = user?.plan ?? "free";
    billing = await Billing.create({
      userId,
      plan,
      status: "active",
      interval: "monthly",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + PERIOD_MS),
    });
  }
  return billing;
}

/**
 * Get the current plan for a user.
 * Prefers the active subscription/trial on the platform channel, then falls
 * back to the billing record, then the user's base plan.
 */
export async function getCurrentPlan(userId: string): Promise<PlanId> {
  // Active subscription/trial on the platform channel takes precedence.
  const effectivePlanId = await getEffectivePlanId(userId, "platform");
  if (effectivePlanId !== "free") {
    return effectivePlanId as PlanId;
  }

  const billing = await Billing.findOne({ userId });
  if (billing && billing.status !== "expired" && billing.status !== "canceled") {
    return billing.plan as PlanId;
  }
  const user = await User.findById(userId);
  return (user?.plan as PlanId) ?? "free";
}


/**
 * Set a user's plan directly (admin action or coupon redemption).
 * Optionally records an audit log entry.
 */
export async function setUserPlan(
  userId: string,
  plan: string,
  opts: {
    interval?: BillingInterval;
    status?: BillingStatus;
    durationDays?: number;
    actorId?: string;
    reason?: string;
  } = {}
): Promise<BillingDoc> {
  if (!(await isPlanId(plan))) {
    throw new Error(`Invalid plan: ${plan}`);
  }

  const now = Date.now();
  const durationMs = (opts.durationDays ?? 30) * 24 * 60 * 60 * 1000;

  const billing = await getOrCreateBilling(userId);
  billing.plan = plan;
  billing.interval = opts.interval ?? billing.interval ?? "monthly";
  billing.status = opts.status ?? "active";
  billing.currentPeriodStart = new Date(now);
  billing.currentPeriodEnd = new Date(now + durationMs);
  billing.cancelAtPeriodEnd = false;
  await billing.save();

  // Keep the User model in sync.
  await User.findByIdAndUpdate(userId, {
    plan,
    planExpiresAt: new Date(now + durationMs),
  });

  if (opts.actorId) {
    await logAudit(
      opts.actorId,
      "",
      "billing.subscription_changed",
      {
        resourceType: "billing",
        resourceId: billing._id.toString(),
        details: {
          targetUserId: userId,
          plan,
          reason: opts.reason ?? "plan_change",
        },
      }
    );
  }

  return billing;
}

/**
 * Cancel a subscription at the end of the current period.
 */
export async function cancelSubscription(
  userId: string,
  actorId?: string
): Promise<BillingDoc> {
  const billing = await getOrCreateBilling(userId);
  billing.cancelAtPeriodEnd = true;
  billing.status = "active"; // still active until period end
  await billing.save();

  if (actorId) {
    await logAudit(
      actorId,
      "",
      "billing.subscription_canceled",
      {
        resourceType: "billing",
        resourceId: billing._id.toString(),
        details: { targetUserId: userId },
      }
    );
  }

  return billing;
}

/**
 * Resume a canceled subscription before the period ends.
 */
export async function resumeSubscription(
  userId: string,
  actorId?: string
): Promise<BillingDoc> {
  const billing = await getOrCreateBilling(userId);
  billing.cancelAtPeriodEnd = false;
  billing.status = "active";
  await billing.save();

  if (actorId) {
    await logAudit(
      actorId,
      "",
      "billing.subscription_resumed",
      {
        resourceType: "billing",
        resourceId: billing._id.toString(),
        details: { targetUserId: userId },
      }
    );
  }

  return billing;
}

/**
 * Check whether a user's plan is still valid (not expired).
 * If expired, downgrades to free.
 */
export async function ensurePlanValid(userId: string): Promise<PlanId> {
  const user = await User.findById(userId);
  if (!user) return "free";

  if (user.planExpiresAt && user.planExpiresAt.getTime() < Date.now()) {
    // Plan expired -> downgrade to free.
    await User.findByIdAndUpdate(userId, { plan: "free", planExpiresAt: null });
    const billing = await Billing.findOne({ userId });
    if (billing) {
      billing.plan = "free";
      billing.status = "expired";
      await billing.save();
    }
    return "free";
  }

  return (user.plan as PlanId) ?? "free";
}

/**
 * Reset the credits-used counter for a new billing period.
 * Called on a schedule or lazily when a user's period rolls over.
 */
export async function rolloverCreditsIfNeeded(userId: string): Promise<void> {
  const user = await User.findById(userId);
  if (!user) return;

  const periodStart = user.creditsPeriodStart ?? new Date(0);
  if (Date.now() - periodStart.getTime() >= PERIOD_MS) {
    await User.findByIdAndUpdate(userId, {
      creditsUsed: 0,
      creditsPeriodStart: new Date(),
    });
  }
}

/**
 * Redeem a coupon and apply its credit/plan to the user.
 * (Coupon model exists; this wires it to the user's credits.)
 */
export async function redeemCoupon(
  userId: string,
  couponId: string,
  actorId?: string
): Promise<{ creditsAdded: number; plan?: PlanId }> {
  const Coupon = (await import("../models/Coupons/Coupon.model")).default;
  const coupon = await Coupon.findOne({ couponIds: couponId });
  if (!coupon) {
    throw new Error("Invalid coupon");
  }
  if (coupon.status !== "active") {
    throw new Error("Coupon is not active");
  }
  if (coupon.expiryDate && coupon.expiryDate.getTime() < Date.now()) {
    throw new Error("Coupon has expired");
  }
  if (coupon.redeemedBy.length >= coupon.maxRedeem) {
    throw new Error("Coupon redemption limit reached");
  }

  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  // Apply credits.
  const creditsAdded = coupon.creditAmount ?? 0;
  if (creditsAdded > 0) {
    await User.findByIdAndUpdate(userId, {
      $inc: { credits: creditsAdded },
    });
  }

  // Record redemption.
  coupon.redeemedBy.push({ uid: user._id, timestamp: new Date() });
  await coupon.save();

  if (actorId) {
    await logAudit(
      actorId,
      "",
      "billing.coupon_redeemed",
      {
        resourceType: "coupon",
        resourceId: coupon._id.toString(),
        details: { couponId, creditsAdded },
      }
    );
  }

  return { creditsAdded };
}

/**
 * Public plan catalog for the frontend pricing page.
 */
export async function getPlanCatalog() {
  return getPlanCatalogFromConfig();
}
