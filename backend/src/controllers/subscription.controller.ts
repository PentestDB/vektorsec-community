import { Request, Response } from "express";
import {
  cancelSubscription,
  expireDueSubscriptions,
  getEffectivePlanId,
  getSubscription,
  hasActiveAccess,
  listAllSubscriptions,
  listUserSubscriptions,
} from "../services/subscription.service";
import { SubscriptionChannel } from "../models/Subscription/Subscription.model";
import { getTodayUsage, getUserTotalUsage } from "../services/usageTracker.service";

/** Validate a channel string against the allowed set. */
function parseChannel(value: unknown): SubscriptionChannel | null {
  if (value === "telegram" || value === "online" || value === "platform") {
    return value;
  }
  return null;
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
