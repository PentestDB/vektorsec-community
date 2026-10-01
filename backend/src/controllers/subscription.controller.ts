import { Request, Response } from "express";
import {
  cancelSubscription,
  expireDueSubscriptions,
  getEffectivePlanId,
  getSubscription,
  hasActiveAccess,
  listAllSubscriptions,
  listUserSubscriptions,
  startTrial,
} from "../services/subscription.service";
import { SubscriptionChannel } from "../models/Subscription/Subscription.model";
import { getTodayUsage, getUserTotalUsage, getUsageHistory } from "../services/usageTracker.service";
import { csvFileName, toCsv } from "../utils/csv";

/** Validate a channel string against the allowed set. */
function parseChannel(value: unknown): SubscriptionChannel | null {
  if (value === "telegram" || value === "online" || value === "platform") {
    return value;
  }
  return null;
}

/** Clamp `?days=` to a sane window (1..365, default 30). */
function clampUsageDays(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 30;
  return Math.min(365, Math.max(1, Math.round(parsed)));
}

/**
 * GET /api/subscriptions/me
 * Auth: get the current user's subscriptions across all channels.
 */
export async function getMySubscriptions(req: Request, res: Response) {
  try {
    const userId = res.locals.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });


    const subs = await listUserSubscriptions(userId);
    return res.status(200).json({ subscriptions: subs });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to load subscriptions" });
  }
}

/**
 * GET /api/subscriptions/me/:channel
 * Auth: get the current user's subscription on a specific channel.
 */
export async function getMyChannelSubscription(req: Request, res: Response) {
  try {
    const userId = res.locals.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });


    const channel = parseChannel(req.params.channel);
    if (!channel) return res.status(400).json({ message: "Invalid channel" });

    const sub = await getSubscription(userId, channel);
    return res.status(200).json({ subscription: sub });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to load subscription" });
  }
}

/**
 * GET /api/subscriptions/me/:channel/access
 * Auth: check whether the user has active access on a channel.
 */
export async function checkAccess(req: Request, res: Response) {
  try {
    const userId = res.locals.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });


    const channel = parseChannel(req.params.channel);
    if (!channel) return res.status(400).json({ message: "Invalid channel" });

    const active = await hasActiveAccess(userId, channel);
    const planId = await getEffectivePlanId(userId, channel);
    return res.status(200).json({ active, planId });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to check access" });
  }
}

/**
 * POST /api/subscriptions/me/:channel/cancel
 * Auth: cancel a subscription (keeps access until endsAt).
 */
export async function cancelSubscriptionHandler(req: Request, res: Response) {
  try {
    const userId = res.locals.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });


    const channel = parseChannel(req.params.channel);
    if (!channel) return res.status(400).json({ message: "Invalid channel" });

    const sub = await cancelSubscription(userId, channel);
    if (!sub) return res.status(404).json({ message: "No subscription found" });
    return res.status(200).json({ message: "Subscription canceled", subscription: sub });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to cancel subscription" });
  }
}

/**
 * GET /api/subscriptions/me/:channel/usage
 * Auth: get today's usage for the user on a channel.
 */
export async function getMyUsage(req: Request, res: Response) {
  try {
    const userId = res.locals.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });


    const channel = parseChannel(req.params.channel);
    if (!channel) return res.status(400).json({ message: "Invalid channel" });

    const today = await getTodayUsage(userId, channel);
    const total = await getUserTotalUsage(userId, 30);
    return res.status(200).json({ today, total30d: total });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to load usage" });
  }
}

/**
 * POST /api/subscriptions/me/:channel/trial
 * Auth: start the one-off free trial on a channel.
 *
 * Body: `{ planId?: string }` — the plan the trial grants access to
 * (defaults to the service default). Sending the request again while a trial
 * is still running returns the existing subscription (idempotent); trying to
 * start a second trial after one was already used returns 409.
 */
export async function startTrialHandler(req: Request, res: Response) {
  try {
    const userId = res.locals.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const channel = parseChannel(req.params.channel);
    if (!channel) return res.status(400).json({ message: "Invalid channel" });

    const planId =
      typeof req.body?.planId === "string" && req.body.planId.trim()
        ? req.body.planId.trim()
        : undefined;

    const before = await getSubscription(userId, channel);
    const subscription = await startTrial(userId, channel, planId);

    const startedNow = !before || before.status !== subscription.status;
    return res.status(startedNow ? 201 : 200).json({
      message: startedNow ? "Trial started" : "Trial already active",
      subscription,
    });
  } catch (error: any) {
    const message = error?.message || "Failed to start trial";
    if (/already used/i.test(message)) {
      return res.status(409).json({ message });
    }
    if (/plan/i.test(message) && /not found|unknown|invalid/i.test(message)) {
      return res.status(400).json({ message });
    }
    return res.status(500).json({ message });
  }
}

/**
 * GET /api/subscriptions/me/:channel/usage/export?days=30
 * Auth: download the caller's daily usage history as a CSV file.
 */
export async function exportMyUsage(req: Request, res: Response) {
  try {
    const userId = res.locals.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const channel = parseChannel(req.params.channel);
    if (!channel) return res.status(400).json({ message: "Invalid channel" });

    const days = clampUsageDays(req.query.days);
    const records = await getUsageHistory(userId, channel, days);

    const rows = records.map((record) => ({
      date: record.date,
      channel: record.channel,
      requests: record.requests,
      tokens_in: record.tokensIn,
      tokens_out: record.tokensOut,
      total_tokens: (record.tokensIn ?? 0) + (record.tokensOut ?? 0),
      cost_usd: Number((record.costUsd ?? 0).toFixed(6)),
    }));

    const csv = toCsv(rows, [
      "date",
      "channel",
      "requests",
      "tokens_in",
      "tokens_out",
      "total_tokens",
      "cost_usd",
    ]);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${csvFileName(`usage-${channel}`)}"`,
    );
    return res.status(200).send(csv);
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to export usage" });
  }
}

/**
 * GET /api/subscriptions/admin
 * Admin: list all subscriptions.
 */
export async function getAllSubscriptions(req: Request, res: Response) {
  try {
    const subs = await listAllSubscriptions();
    return res.status(200).json({ subscriptions: subs });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to load subscriptions" });
  }
}

/**
 * POST /api/subscriptions/admin/expire-due
 * Admin: manually trigger expiry of due subscriptions.
 */
export async function expireDueHandler(req: Request, res: Response) {
  try {
    const count = await expireDueSubscriptions();
    return res.status(200).json({ message: `Expired ${count} subscription(s)` });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to expire subscriptions" });
  }
}
