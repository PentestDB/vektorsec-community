import mongoose from "mongoose";
import UsageRecord, {
  UsageChannel,
  UsageRecordDoc,
} from "../models/UsageRecord/UsageRecord.model";
import { getPlanOrFree } from "./plan.service";
import { getEffectivePlanId } from "./subscription.service";


/**
 * Usage tracker service.
 *
 * Tracks requests / tokens / cost per user per channel per day.
 * Used to enforce usage limits and to bill hosted-API usage
 * (telegram / online channels).
 */

/** Format a Date as YYYY-MM-DD (local time). */
function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Record usage for a user on a channel.
 * Upserts the daily record, incrementing counters atomically.
 */
export async function recordUsage(
  userId: string | mongoose.Types.ObjectId,
  channel: UsageChannel,
  opts: {
    requests?: number;
    tokensIn?: number;
    tokensOut?: number;
    costUsd?: number;
  } = {},
): Promise<void> {
  const date = dateKey();
  const inc: Record<string, number> = {};
  if (opts.requests) inc.requests = opts.requests;
  if (opts.tokensIn) inc.tokensIn = opts.tokensIn;
  if (opts.tokensOut) inc.tokensOut = opts.tokensOut;
  if (opts.costUsd) inc.costUsd = opts.costUsd;

  if (Object.keys(inc).length === 0) return;

  await UsageRecord.findOneAndUpdate(
    { userId, channel, date },
    { $inc: inc },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

/**
 * Get today's usage for a user on a channel.
 * Returns zeroed counters if no record exists.
 */
export async function getTodayUsage(
  userId: string | mongoose.Types.ObjectId,
  channel: UsageChannel,
) {
  const date = dateKey();
  const rec = await UsageRecord.findOne({ userId, channel, date });
  return {
    date,
    requests: rec?.requests ?? 0,
    tokensIn: rec?.tokensIn ?? 0,
    tokensOut: rec?.tokensOut ?? 0,
    costUsd: rec?.costUsd ?? 0,
  };
}

/**
 * Get the combined usage for a user across ALL channels today.
 * Used to enforce per-plan daily token/request limits across the whole system
 * (so a user can't bypass limits by switching channels).
 */
export async function getTotalTodayUsage(userId: string | mongoose.Types.ObjectId) {
  const date = dateKey();
  const records = await UsageRecord.find({ userId, date });
  const total = records.reduce(
    (acc, r) => {
      acc.requests += r.requests ?? 0;
      acc.tokensIn += r.tokensIn ?? 0;
      acc.tokensOut += r.tokensOut ?? 0;
      acc.costUsd += r.costUsd ?? 0;
      return acc;
    },
    { requests: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, totalTokens: 0 },
  );
  total.totalTokens = total.tokensIn + total.tokensOut;
  return total;
}

/**
 * Check whether a user has exceeded their plan's daily token/request limits.
 * Returns a descriptive error if blocked.
 *
 * @returns null if allowed, otherwise an object describing the limit hit.
 */
export async function checkUsageLimits(
  userId: string | mongoose.Types.ObjectId,
  channel: UsageChannel,
): Promise<{
  allowed: boolean;
  reason?: string;
  code?: string;
  limit?: number;
  current?: number;
} | null> {
  try {
    const effectivePlanId = await getEffectivePlanId(userId, channel);
    const plan = await getPlanOrFree(effectivePlanId);
    const limits = plan.limits;

    const today = await getTotalTodayUsage(userId);
    const totalTokensToday = today.totalTokens;

    // 1. Daily token limit (across all channels)
    if (limits.maxTokensPerDay > 0 && totalTokensToday >= limits.maxTokensPerDay) {
      return {
        allowed: false,
        reason: `Daily token limit reached (${totalTokensToday.toLocaleString()} / ${limits.maxTokensPerDay.toLocaleString()}). Upgrade your plan or wait until tomorrow.`,
        code: "PLAN_LIMIT_TOKENS_PER_DAY",
        limit: limits.maxTokensPerDay,
        current: totalTokensToday,
      };
    }

    // 2. Daily request limit (across all channels)
    if (limits.maxRequestsPerDay > 0 && today.requests >= limits.maxRequestsPerDay) {
      return {
        allowed: false,
        reason: `Daily request limit reached (${today.requests} / ${limits.maxRequestsPerDay}). Upgrade your plan or wait until tomorrow.`,
        code: "PLAN_LIMIT_REQUESTS_PER_DAY",
        limit: limits.maxRequestsPerDay,
        current: today.requests,
      };
    }

    return null;
  } catch (err) {
    console.warn("[usage] checkUsageLimits error:", err);
    // Fail open — don't block usage if the check itself fails.
    return null;
  }
}

/**
 * Get usage for a user on a channel over the last N days.
 */
export async function getUsageHistory(
  userId: string | mongoose.Types.ObjectId,
  channel: UsageChannel,
  days = 30,
): Promise<UsageRecordDoc[]> {

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceKey = dateKey(since);
  return UsageRecord.find({
    userId,
    channel,
    date: { $gte: sinceKey },
  }).sort({ date: 1 });
}

/**
 * Get total usage for a user across all channels (for billing dashboard).
 */
export async function getUserTotalUsage(
  userId: string | mongoose.Types.ObjectId,
  days = 30,
) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceKey = dateKey(since);

  const records = await UsageRecord.find({
    userId,
    date: { $gte: sinceKey },
  });

  return records.reduce(
    (acc, r) => {
      acc.requests += r.requests;
      acc.tokensIn += r.tokensIn;
      acc.tokensOut += r.tokensOut;
      acc.costUsd += r.costUsd;
      return acc;
    },
    { requests: 0, tokensIn: 0, tokensOut: 0, costUsd: 0 },
  );
}

/**
 * Get usage summary for all users (admin view).
 */
export async function getGlobalUsageSummary(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceKey = dateKey(since);

  const records = await UsageRecord.find({ date: { $gte: sinceKey } });

  const byChannel: Record<string, { requests: number; tokensIn: number; tokensOut: number; costUsd: number }> = {
    telegram: { requests: 0, tokensIn: 0, tokensOut: 0, costUsd: 0 },
    online: { requests: 0, tokensIn: 0, tokensOut: 0, costUsd: 0 },
    platform: { requests: 0, tokensIn: 0, tokensOut: 0, costUsd: 0 },
  };

  let total = { requests: 0, tokensIn: 0, tokensOut: 0, costUsd: 0 };

  for (const r of records) {
    const c = byChannel[r.channel] ?? (byChannel[r.channel] = { requests: 0, tokensIn: 0, tokensOut: 0, costUsd: 0 });
    c.requests += r.requests;
    c.tokensIn += r.tokensIn;
    c.tokensOut += r.tokensOut;
    c.costUsd += r.costUsd;
    total.requests += r.requests;
    total.tokensIn += r.tokensIn;
    total.tokensOut += r.tokensOut;
    total.costUsd += r.costUsd;
  }

  return { byChannel, total };
}
