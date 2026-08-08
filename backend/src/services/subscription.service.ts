import mongoose from "mongoose";
import Subscription, {
  SubscriptionChannel,
  SubscriptionDoc,
} from "../models/Subscription/Subscription.model";
import { getPlanOrFree } from "./plan.service";
import { getPlan } from "../config/plans";


/**
 * Subscription service.
 *
 * Manages subscriptions across all channels
 * (telegram / online / platform). Admins set pricing via the
 * admin panel (channel-based pricing in the Plan model).
 */

/** Subscription period in days (monthly). */
export const MONTHLY_DAYS = 30;

/**
 * Get the active subscription for a user on a channel.
 * Returns null if none exists.
 */
export async function getSubscription(
  userId: string | mongoose.Types.ObjectId,
  channel: SubscriptionChannel,
): Promise<SubscriptionDoc | null> {
  return Subscription.findOne({ userId, channel });
}

/**
 * Check whether a user has an active (non-expired) subscription on a channel.
 */
export async function hasActiveAccess(
  userId: string | mongoose.Types.ObjectId,
  channel: SubscriptionChannel,
): Promise<boolean> {
  const sub = await getSubscription(userId, channel);
  if (!sub) return false;
  return isSubscriptionActive(sub);
}

/**
 * Determine whether a subscription currently grants access.
 * Handles subscription expiry.
 *
 * Trial subscriptions are active as long as they haven't been explicitly
 * ended — they only stop when the cumulative token cap is reached
 * (checked separately via the plan's maxTokensPerTrial limit).
 */
export function isSubscriptionActive(sub: SubscriptionDoc): boolean {
  const now = new Date();

  if (sub.status === "canceled") return false;
  if (sub.status === "expired") return false;
  if (sub.status !== "trial" && sub.endsAt && now > sub.endsAt) return false;
  return true;
}

/**
 * Start a trial subscription for a user on a channel.
 *
 * Trials have NO time-based expiry — they end only when the cumulative
 * token cap (maxTokensPerTrial) is reached. `endsAt` is left unset so the
 * trial never auto-expires based on time.
 */
export async function startTrial(
  userId: string | mongoose.Types.ObjectId,
  channel: SubscriptionChannel,
  planId = "pro",
): Promise<SubscriptionDoc> {
  const existing = await getSubscription(userId, channel);

  // If there's already an active subscription (paid or trial), return it.
  if (existing) {
    if (isSubscriptionActive(existing)) {
      return existing;
    }
    if (existing.status === "trial") {
      throw new Error("Trial already used. Upgrade to a paid plan to continue.");
    }
  }

  // Validate the trial plan exists.
  await getPlanOrFree(planId);

  if (existing) {
    // Convert existing (e.g. expired/canceled) record into a fresh trial.
    existing.status = "trial";
    existing.planId = planId;
    existing.startedAt = new Date();
    existing.endsAt = undefined;
    existing.autoRenew = false;
    existing.trialTokensUsed = 0;
    return existing.save();
  }

  return Subscription.create({
    userId,
    channel,
    planId,
    status: "trial",
    startedAt: new Date(),
    endsAt: undefined,
    autoRenew: false,
    trialTokensUsed: 0,
  });
}

/**
 * Check whether a user's subscription on a channel is currently a trial.
 */
export async function isTrialActive(
  userId: string | mongoose.Types.ObjectId,
  channel: SubscriptionChannel,
): Promise<boolean> {
  const sub = await getSubscription(userId, channel);
  return !!sub && sub.status === "trial" && isSubscriptionActive(sub);
}

/**
 * Check whether the user's trial token cap has been reached.
 * Returns true if the trial is over (cap reached).
 */
export async function isTrialExhausted(
  userId: string | mongoose.Types.ObjectId,
  channel: SubscriptionChannel,
): Promise<boolean> {
  const sub = await getSubscription(userId, channel);
  if (!sub || sub.status !== "trial") return false;

  const plan = await getPlan(sub.planId);
  const cap = plan.limits.maxTokensPerTrial ?? 0;
  if (cap <= 0) return false; // 0 = unlimited trial
  return (sub.trialTokensUsed ?? 0) >= cap;
}

/**
 * Increment the cumulative token count used during a trial.
 * Call this after each agent turn that consumes tokens on a trial.
 * If the cap is reached, the trial is automatically ended.
 */
export async function recordTrialTokens(
  userId: string | mongoose.Types.ObjectId,
  channel: SubscriptionChannel,
  tokens: number,
): Promise<SubscriptionDoc | null> {
  const sub = await getSubscription(userId, channel);
  if (!sub || sub.status !== "trial") return null;

  sub.trialTokensUsed = (sub.trialTokensUsed ?? 0) + Math.max(0, tokens);
  await sub.save();

  // Auto-end the trial if the cap has been reached.
  const exhausted = await isTrialExhausted(userId, channel);
  if (exhausted) {
    sub.status = "expired";
    await sub.save();
  }

  return sub;
}


/**
 * Activate a paid subscription for a user on a channel.
 * - If a subscription exists, renew/extend it.
 */
export async function activateSubscription(
  userId: string | mongoose.Types.ObjectId,
  channel: SubscriptionChannel,
  planId: string,
  opts: {
    paymentOrderId?: string;
    autoRenew?: boolean;
    periodDays?: number;
  } = {},
): Promise<SubscriptionDoc> {
  const now = new Date();
  const periodDays = opts.periodDays ?? MONTHLY_DAYS;
  const endsAt = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000);

  // Validate plan exists.
  await getPlanOrFree(planId);

  const existing = await getSubscription(userId, channel);

  if (existing) {
    existing.status = "active";
    existing.planId = planId;
    existing.startedAt = now;
    existing.endsAt = endsAt;
    existing.autoRenew = opts.autoRenew ?? existing.autoRenew;
    if (opts.paymentOrderId) existing.paymentOrderId = opts.paymentOrderId;
    return existing.save();
  }

  return Subscription.create({
    userId,
    channel,
    planId,
    status: "active",
    startedAt: now,
    endsAt,
    autoRenew: opts.autoRenew ?? false,
    paymentOrderId: opts.paymentOrderId,
  });
}

/**
 * Cancel a subscription (stops auto-renew, keeps access until endsAt).
 */
export async function cancelSubscription(
  userId: string | mongoose.Types.ObjectId,
  channel: SubscriptionChannel,
): Promise<SubscriptionDoc | null> {
  const sub = await getSubscription(userId, channel);
  if (!sub) return null;
  sub.status = "canceled";
  sub.autoRenew = false;
  return sub.save();
}

/**
 * Mark a subscription as expired (called by a cron / on access check).
 */
export async function expireSubscription(
  userId: string | mongoose.Types.ObjectId,
  channel: SubscriptionChannel,
): Promise<SubscriptionDoc | null> {
  const sub = await getSubscription(userId, channel);
  if (!sub) return null;
  sub.status = "expired";
  sub.autoRenew = false;
  return sub.save();
}

/**
 * Get the effective plan limits for a user on a channel.
 * Returns the plan limits if active (paid or trial), otherwise the free plan limits.
 */
export async function getEffectivePlanId(
  userId: string | mongoose.Types.ObjectId,
  channel: SubscriptionChannel,
): Promise<string> {
  const sub = await getSubscription(userId, channel);
  if (sub && isSubscriptionActive(sub)) {
    // Trial exhausted → fall back to free.
    if (sub.status === "trial" && (await isTrialExhausted(userId, channel))) {
      return "free";
    }
    return sub.planId;
  }
  return "free";
}


/**
 * List all subscriptions for a user (all channels).
 */
export async function listUserSubscriptions(
  userId: string | mongoose.Types.ObjectId,
): Promise<SubscriptionDoc[]> {
  return Subscription.find({ userId });
}

/**
 * List all subscriptions (admin view).
 */
export async function listAllSubscriptions(): Promise<SubscriptionDoc[]> {
  return Subscription.find().sort({ createdAt: -1 });
}

/**
 * Check for expired subscriptions and mark them expired.
 * Called periodically (e.g., every hour) by a cron job.
 *
 * Trials are NOT auto-expired here — they have no time-based expiry and end
 * only when the cumulative token cap is reached (handled in
 * recordTrialTokens / isTrialExhausted).
 */
export async function expireDueSubscriptions(): Promise<number> {
  const now = new Date();
  const result = await Subscription.updateMany(
    {
      endsAt: { $lt: now },
      status: { $nin: ["expired", "trial"] },
    },
    { $set: { status: "expired", autoRenew: false } },
  );

  return result.modifiedCount;
}


