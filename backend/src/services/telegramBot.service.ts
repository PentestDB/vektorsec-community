import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";
import mongoose from "mongoose";
import TelegramUser from "../models/TelegramUser/TelegramUser.model";
import User from "../models/User/User.model";
import SessionsModel from "../models/Sessions/Sessions.model";
import WorkspaceModel from "../models/Workspace/Workspace.model";
import HistoryArchiveModel from "../models/HistoryArchive/HistoryArchive.model";
import {
  getSubscription,
  isSubscriptionActive,
  cancelSubscription,
  getEffectivePlanId,
  activateSubscription,
  startTrial,
  listAllSubscriptions,
} from "./subscription.service";
import { getPlanOrFree } from "./plan.service";
import { initAndRun, SSEWriter } from "./agent.service";
import { registerAbortController, abortSession } from "./agent.service";
import { getTodayUsage, checkUsageLimits } from "./usageTracker.service";
import { logNotification } from "./notificationLog.service";
import getSecrets from "../utils/getSecrets";





/**
 * Telegram Bot service.
 *
 * Connects to the Telegram Bot API via HTTP (no external dependency).
 * Handles commands: /start /subscribe /trial /status /usage /cancel /help
 * and forwards free-form messages to the Pentest Agent Engine.
 *
 * The bot token is read from the TELEGRAM_BOT_TOKEN env var.
 */

const TELEGRAM_API = "https://api.telegram.org";

let botToken = "";
let botRunning = false;
let lastUpdateId = 0;
let rateLimitedUntil = 0;

/** Set the bot token (called at startup from server.ts). */
export function setBotToken(token: string): void {
  botToken = token;
}

export function isBotConfigured(): boolean {
  return botToken.length > 0;
}

export function isBotRunning(): boolean {
  return botRunning;
}

/** True while Telegram is rate-limiting us (HTTP 429) — used by the admin monitor. */
export function isBotRateLimited(): boolean {
  return rateLimitedUntil > Date.now();
}

/** When the rate limit window expires (epoch ms). 0 = not rate limited. */
export function getRateLimitedUntil(): number {
  return rateLimitedUntil;
}

/** Fetch bot identity via getMe (used for Test Connection). */
export async function getBotInfo(): Promise<any | null> {
  if (!botToken) return null;
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${botToken}/getMe`);
    const data = await res.json() as any;
    if (!data.ok) {
      console.warn(`[telegram] getMe failed:`, data.description);
      return null;
    }
    return data.result;
  } catch (err: any) {
    console.warn(`[telegram] getMe error:`, err.message);
    return null;
  }
}

/** Fetch current webhook info (for webhook mode). */
export async function getWebhookInfo(): Promise<any | null> {
  if (!botToken) return null;
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${botToken}/getWebhookInfo`);
    const data = await res.json() as any;
    if (!data.ok) return null;
    return data.result;
  } catch (err: any) {
    console.warn(`[telegram] getWebhookInfo error:`, err.message);
    return null;
  }
}

/** Set (or clear with empty url) the Telegram webhook URL. */
export async function setTelegramWebhook(url: string): Promise<any | null> {
  if (!botToken) return null;
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(url ? { url } : { url: "" }),
    });
    const data = await res.json() as any;
    if (!data.ok) {
      console.warn(`[telegram] setWebhook failed:`, data.description);
      return null;
    }
    return data.result;
  } catch (err: any) {
    console.warn(`[telegram] setWebhook error:`, err.message);
    return null;
  }
}

/**
 * Broadcast a message to every known Telegram user.
 * Returns counts of delivered / failed sends.
 */
export async function broadcastMessage(text: string): Promise<{ sent: number; failed: number }> {
  const users = await TelegramUser.find({}).select("chatId username").lean();
  let sent = 0;
  let failed = 0;
  for (const u of users) {
    if (!u.chatId) {
      failed++;
      continue;
    }
    const ok = await callTelegram("sendMessage", {
      chat_id: u.chatId,
      text,
      parse_mode: "Markdown",
    });
    if (ok) sent++;
    else failed++;
  }
  return { sent, failed };
}


// ─── Telegram API helpers ────────────────────────────────────────────

async function callTelegram(method: string, body: Record<string, any>): Promise<any> {
  if (!botToken) return null;
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json() as any;
    if (!data.ok) {
      console.warn(`[telegram] API ${method} failed:`, data.description);
      return null;
    }
    return data.result;
  } catch (err: any) {
    console.warn(`[telegram] API ${method} error:`, err.message);
    return null;
  }
}

async function sendMessage(chatId: string, text: string, opts: Record<string, any> = {}): Promise<void> {
  const result = await callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
    ...opts,
  });

  // Record a delivery log for the admin Notification Logs panel.
  await logNotification({
    channel: "telegram",
    recipient: String(chatId),
    type: "telegram_message",
    status: result ? "success" : "failed",
    payload: { chatId: String(chatId), text: String(text).slice(0, 500) },
    error: result ? undefined : "Telegram API returned an error",
  });
}

async function sendChatAction(chatId: string, action = "typing"): Promise<void> {
  await callTelegram("sendChatAction", { chat_id: chatId, action });
}

// ─── User / session helpers ──────────────────────────────────────────

async function getOrCreateTelegramUser(msg: any): Promise<any> {
  const from = msg.from;
  const chatId = String(msg.chat.id);
  const telegramId = String(from.id);

  let tu = await TelegramUser.findOne({ telegramId });
  if (!tu) {
    tu = await TelegramUser.create({
      telegramId,
      chatId,
      username: from.username,
      firstName: from.first_name,
      lastName: from.last_name,
      linked: false,
      lastSeenAt: new Date(),
    });
  } else {
    tu.chatId = chatId;
    tu.username = from.username ?? tu.username;
    tu.firstName = from.first_name ?? tu.firstName;
    tu.lastName = from.last_name ?? tu.lastName;
    tu.lastSeenAt = new Date();
    await tu.save();
  }
  return tu;
}

async function ensureSession(tu: any): Promise<string> {
  if (tu.sessionId) {
    const existing = await SessionsModel.findOne({ sessionId: tu.sessionId });
    if (existing) return tu.sessionId;
  }

  const sessionId = uuidv4();
  const workspaceId = uuidv4();

  const workspace = new WorkspaceModel({
    uid: tu.userId ?? new mongoose.Types.ObjectId(),
    workspaceId,
    name: `Telegram-${tu.username ?? tu.telegramId}`,
    description: "Auto-created Telegram session",
    type: "general",
    createdAt: new Date(),
  });
  await workspace.save();

  const archive = new HistoryArchiveModel({ sessionId, history: [] });
  await archive.save();

  const session = new SessionsModel({
    uid: tu.userId ?? new mongoose.Types.ObjectId(),
    sessionId,
    workspaceId,
    name: `Telegram-${tu.username ?? tu.telegramId}`,
    description: "Auto-created Telegram session",
    createdAt: new Date(),
  });
  await session.save();

  tu.sessionId = sessionId;
  await tu.save();
  return sessionId;
}

// ─── Command handlers ────────────────────────────────────────────────

async function handleStart(chatId: string, tu: any): Promise<void> {
  const text = [
    "*VektorSec — Telegram Bot*",
    "",
    "Welcome! I'm VektorSec, your AI pentest assistant.",
    "",
    "*Available commands:*",
    "`/start` — Show this help",
    "`/subscribe` — View plans & subscribe",
    "`/trial` — Start your free trial",
    "`/status` — Check your subscription",
    "`/usage` — Check your usage",
    "`/cancel` — Cancel subscription",
    "`/help` — Show help",
    "",
    "Or just send me a message and I'll run the pentest agent.",
    "",
    tu.linked
      ? "Linked to platform account"
      : "Not linked to a platform account yet. Contact admin to link.",
  ].join("\n");
  await sendMessage(chatId, text);

  // Show admin commands if the user is an admin.
  const admin = await getAdminUser(tu);
  if (admin) {
    await handleAdminHelp(chatId);
  }
}


async function handleSubscribe(chatId: string, tu: any): Promise<void> {
  const plans = ["free", "pro", "team", "enterprise"];
  const lines = ["*Available Plans (Telegram channel)*", ""];
  for (const planId of plans) {
    try {
      const plan = await getPlanOrFree(planId);
      const price = plan.priceMonthly;
      lines.push(`*${plan.name}* — $${price}/month`);
      if (plan.features?.length) {
        lines.push(`  ${plan.features.slice(0, 3).join(", ")}`);
      }
      lines.push("");
    } catch {
      // skip
    }
  }

  lines.push("To subscribe, contact the admin or use the web platform at /pricing.");
  await sendMessage(chatId, lines.join("\n"));
}

async function handleStatus(chatId: string, tu: any): Promise<void> {
  if (!tu.userId) {
    await sendMessage(chatId, "No linked account. Contact admin to link.");
    return;
  }

  const sub = await getSubscription(tu.userId, "telegram");
  if (!sub) {
    await sendMessage(chatId, "You don't have a Telegram subscription yet.\nUse `/subscribe` to view available plans.");
    return;
  }

  const active = isSubscriptionActive(sub);
  const plan = await getPlanOrFree(sub.planId);
  const lines = [
    "*Subscription Status*",
    "",
    `Plan: *${plan.name}*`,
    `Status: ${active ? "Active" : "Inactive"}`,
    `Renews: ${sub.endsAt?.toISOString().slice(0, 10)}`,
    `Auto-renew: ${sub.autoRenew ? "Yes" : "No"}`,
  ];
  await sendMessage(chatId, lines.join("\n"));
}

async function handleUsage(chatId: string, tu: any): Promise<void> {
  if (!tu.userId) {
    await sendMessage(chatId, "No linked account. Contact admin to link.");
    return;
  }

  const planId = await getEffectivePlanId(tu.userId, "telegram");
  const plan = await getPlanOrFree(planId);
  const limits = plan.limits;

  const usage = await getTodayUsage(tu.userId, "telegram");

  const lines = [
    "*Usage*",
    "",
    `Plan: *${plan.name}*`,
    `Requests today: ${usage.requests} / ${limits?.maxSessionsPerPeriod ?? "∞"}`,
    `Tokens today: ${usage.tokensIn} in / ${usage.tokensOut} out`,
    `Cost today: $${usage.costUsd.toFixed(4)}`,
  ];
  await sendMessage(chatId, lines.join("\n"));

}

async function handleCancel(chatId: string, tu: any): Promise<void> {
  if (!tu.userId) {
    await sendMessage(chatId, "No linked account.");
    return;
  }
  const sub = await cancelSubscription(tu.userId, "telegram");
  if (sub) {
    await sendMessage(chatId, "Subscription canceled. You'll keep access until the end of the period.");
  } else {
    await sendMessage(chatId, "No active subscription to cancel.");
  }
}

/**
 * Start the one-off free trial for the Telegram channel.
 *
 * Uses the same service as the web checkout
 * (`POST /api/subscriptions/me/telegram/trial`) so the trial rules — one per
 * account, token-capped, no time-based expiry — are identical on every channel.
 * Usage: `/trial` (or `/trial <planId>`).
 */
async function handleTrial(chatId: string, tu: any, args: string[] = []): Promise<void> {
  if (!tu.userId) {
    await sendMessage(chatId, "No linked account. Contact admin to link your account first.");
    return;
  }

  const existing = await getSubscription(tu.userId, "telegram");
  if (existing && isSubscriptionActive(existing)) {
    const plan = await getPlanOrFree(existing.planId);
    const label = existing.status === "trial" ? "Trial" : "Subscription";
    await sendMessage(
      chatId,
      `${label} already active: *${plan.name}*.\nUse /usage to see the remaining quota.`,
    );
    return;
  }

  try {
    const sub = await startTrial(tu.userId, "telegram", args[0]?.trim() || undefined);
    const plan = await getPlanOrFree(sub.planId);
    const trialCap = plan.limits?.maxTokensPerTrial;
    const lines = [
      "*Trial started* 🎉",
      "",
      `Plan: *${plan.name}*`,
      `Included: ${trialCap ? `${trialCap.toLocaleString()} tokens` : "unlimited tokens"} ` +
        "(the trial ends when this cap is reached — there is no time limit)",
      `Requests/day: ${plan.limits?.maxRequestsPerDay || "∞"}`,
      `Tokens/day: ${plan.limits?.maxTokensPerDay || "∞"}`,
      "",
      "Send me a target and I'll start testing. Use /usage to follow your quota.",
    ];
    await sendMessage(chatId, lines.join("\n"));
  } catch (err: any) {
    const message = err?.message ?? "unknown error";
    if (/already used/i.test(message)) {
      await sendMessage(
        chatId,
        "You have already used your free trial.\nUse /subscribe to see the paid plans.",
      );
      return;
    }
    await sendMessage(chatId, `Could not start the trial: ${message}`);
  }
}

async function handleHelp(chatId: string, tu: any): Promise<void> {
  await handleStart(chatId, tu);
}
// ─── Admin command handlers ──────────────────────────────────────────

/**
 * Load the comma-separated list of Telegram user IDs granted admin access
 * via the TELEGRAM_ADMIN_IDS env var (used for testing without linking to a
 * platform admin account).
 */
async function getEnvAdminIds(): Promise<string[]> {
  try {
    const raw = await getSecrets("TELEGRAM_ADMIN_IDS");
    if (!raw) return [];
    return raw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Check whether a Telegram user is an admin.
 *
 * A user is considered an admin if EITHER:
 *  1. Their Telegram ID is listed in the TELEGRAM_ADMIN_IDS env var
 *     (comma-separated) — useful for testing without a platform account, OR
 *  2. Their linked platform account has role === "admin".
 *
 * Returns the admin User doc (if linked), or a lightweight marker object
 * (for env-var admins), or null if not an admin.
 */
async function getAdminUser(tu: any): Promise<any | null> {
  // 1. Env-var admin (testing) — no platform link required.
  const envAdminIds = await getEnvAdminIds();
  if (envAdminIds.includes(tu.telegramId)) {
    return { _id: null, role: "admin", envAdmin: true };
  }

  // 2. Linked platform admin.
  if (!tu.userId) return null;
  const user = await User.findById(tu.userId);
  if (!user) return null;
  return user.role === "admin" ? user : null;
}


async function handleAdminHelp(chatId: string): Promise<void> {
  const text = [
    "*Admin Commands*",
    "",
    "`/admin` — Show this help",
    "`/admin users` — List Telegram users (last 100)",
    "`/admin link <telegramId> <userId>` — Link a Telegram user to a platform account",
    "`/admin unlink <telegramId>` — Unlink a Telegram user",
    "`/admin grant <userId> <plan>` — Activate a subscription (plan: free/pro/team/enterprise)",
    "`/admin revoke <userId>` — Cancel a subscription",
    "`/admin subs` — List all subscriptions",
    "`/admin status` — Show bot status",
    "",
    "Example: `/admin link 987654321 65f1a2b3c4d5e6f7a8b9c0d1`",
  ].join("\n");
  await sendMessage(chatId, text);
}

async function handleAdminUsers(chatId: string): Promise<void> {
  const users = await TelegramUser.find().sort({ lastSeenAt: -1 }).limit(100);
  if (!users.length) {
    await sendMessage(chatId, "No Telegram users yet.");
    return;
  }
  const lines = ["*Telegram Users*", ""];
  for (const u of users) {
    const name = u.username ? `@${u.username}` : `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.telegramId;
    lines.push(
      `• \`${u.telegramId}\` — ${name} — ${u.linked ? "linked" : "not linked"}`,
    );
  }
  await sendMessage(chatId, lines.join("\n"));
}

async function handleAdminLink(chatId: string, args: string[]): Promise<void> {
  const [telegramId, userId] = args;
  if (!telegramId || !userId) {
    await sendMessage(chatId, "Usage: `/admin link <telegramId> <userId>`");
    return;
  }
  const tu = await TelegramUser.findOne({ telegramId });
  if (!tu) {
    await sendMessage(chatId, `Telegram user \`${telegramId}\` not found. Ask them to press /start first.`);
    return;
  }
  const user = await User.findById(userId);
  if (!user) {
    await sendMessage(chatId, `Platform user \`${userId}\` not found.`);
    return;
  }
  tu.userId = user._id as any;
  tu.linked = true;
  await tu.save();
  await sendMessage(chatId, `Linked \`${telegramId}\` → \`${user.email}\` (${user.role})`);
}

async function handleAdminUnlink(chatId: string, args: string[]): Promise<void> {
  const [telegramId] = args;
  if (!telegramId) {
    await sendMessage(chatId, "Usage: `/admin unlink <telegramId>`");
    return;
  }
  const tu = await TelegramUser.findOne({ telegramId });
  if (!tu) {
    await sendMessage(chatId, `Telegram user \`${telegramId}\` not found.`);
    return;
  }
  tu.userId = undefined;
  tu.linked = false;
  await tu.save();
  await sendMessage(chatId, `Unlinked \`${telegramId}\``);
}

async function handleAdminGrant(chatId: string, args: string[]): Promise<void> {
  const [userId, planId] = args;
  if (!userId || !planId) {
    await sendMessage(chatId, "Usage: `/admin grant <userId> <plan>` (plan: free/pro/team/enterprise)");
    return;
  }
  const validPlans = ["free", "pro", "team", "enterprise"];
  if (!validPlans.includes(planId)) {
    await sendMessage(chatId, `Invalid plan \`${planId}\`. Valid: ${validPlans.join(", ")}`);
    return;
  }
  const user = await User.findById(userId);
  if (!user) {
    await sendMessage(chatId, `Platform user \`${userId}\` not found.`);
    return;
  }
  const sub = await activateSubscription(userId, "telegram", planId, { autoRenew: false });
  await sendMessage(
    chatId,
    `Activated *${planId}* subscription for \`${user.email}\` on Telegram.\nExpires: ${sub.endsAt?.toISOString().slice(0, 10)}`,
  );
}

async function handleAdminRevoke(chatId: string, args: string[]): Promise<void> {
  const [userId] = args;
  if (!userId) {
    await sendMessage(chatId, "Usage: `/admin revoke <userId>`");
    return;
  }
  const sub = await cancelSubscription(userId, "telegram");
  if (sub) {
    await sendMessage(chatId, `Canceled subscription for \`${userId}\`.`);
  } else {
    await sendMessage(chatId, `No active subscription for \`${userId}\`.`);
  }
}

async function handleAdminSubs(chatId: string): Promise<void> {
  const subs = await listAllSubscriptions();
  if (!subs.length) {
    await sendMessage(chatId, "No subscriptions yet.");
    return;
  }
  const lines = ["*All Subscriptions*", ""];
  for (const s of subs.slice(0, 50)) {
    const active = isSubscriptionActive(s);
    lines.push(
      `• \`${s.userId}\` — ${s.channel} — ${s.planId} — ${s.status} — ${active ? "active" : "inactive"}`,
    );
  }
  await sendMessage(chatId, lines.join("\n"));
}

async function handleAdminStatus(chatId: string): Promise<void> {
  await sendMessage(
    chatId,
    `*Bot Status*\n\nConfigured: ${isBotConfigured() ? "Yes" : "No"}\nRunning: ${isBotRunning() ? "Yes" : "No"}`,
  );
}

async function handleAdmin(chatId: string, tu: any, args: string[]): Promise<void> {
  const admin = await getAdminUser(tu);
  if (!admin) {
    await sendMessage(chatId, "Access denied. You must be an admin with a linked platform account.");
    return;
  }

  const sub = args[0] ?? "";
  switch (sub) {
    case "users":
      await handleAdminUsers(chatId);
      break;
    case "link":
      await handleAdminLink(chatId, args.slice(1));
      break;
    case "unlink":
      await handleAdminUnlink(chatId, args.slice(1));
      break;
    case "grant":
      await handleAdminGrant(chatId, args.slice(1));
      break;
    case "revoke":
      await handleAdminRevoke(chatId, args.slice(1));
      break;
    case "subs":
      await handleAdminSubs(chatId);
      break;
    case "status":
      await handleAdminStatus(chatId);
      break;
    default:
      await handleAdminHelp(chatId);
  }
}

// ─── Agent message handling ──────────────────────────────────────────


async function handleAgentMessage(chatId: string, tu: any, text: string): Promise<void> {
  if (!tu.userId) {
    await sendMessage(
      chatId,
      "You need a linked platform account to use the agent.\nContact the admin to link your Telegram account.",
    );
    return;
  }

  // Check subscription access
  const planId = await getEffectivePlanId(tu.userId, "telegram");
  if (planId === "free") {
    await sendMessage(
      chatId,
      "You don't have an active subscription on the Telegram channel.\nUse `/subscribe` to view available plans.",
    );
    return;
  }

  // Check plan-based usage limits (tokens/day, requests/day, trial cap).
  const limitCheck = await checkUsageLimits(tu.userId, "telegram");
  if (limitCheck && !limitCheck.allowed) {
    await sendMessage(chatId, `*Usage limit reached*\n\n${limitCheck.reason}`);
    return;
  }

  await sendChatAction(chatId, "typing");

  const sessionId = await ensureSession(tu);

  // Build an in-memory SSE writer that forwards events to Telegram.
  const sse: SSEWriter = {
    write: (event, data) => {
      // Forward meaningful events to the user via Telegram.
      if (event === "thinking" && data?.content) {
        // Only send short thinking snippets to avoid spam.
        const snippet = String(data.content).slice(0, 200);
        sendMessage(chatId, `[thinking] ${snippet}`).catch(() => {});
      } else if (event === "tool_start" && data?.name) {
        sendMessage(chatId, `Running: \`${data.name}\``).catch(() => {});
      } else if (event === "tool_done" && data?.name) {
        const out = String(data.output ?? "").slice(0, 500);
        sendMessage(chatId, `\`${data.name}\` done\n\`\`\`\n${out}\n\`\`\``).catch(() => {});
      } else if (event === "consent_required" && data?.name) {
        sendMessage(chatId, `Approval required for \`${data.name}\`.\nPlease approve on the web platform.`).catch(() => {});
      } else if (event === "error" && data?.message) {
        sendMessage(chatId, `Error: ${data.message}`).catch(() => {});
      } else if (event === "done") {
        sendMessage(chatId, "Agent turn completed.").catch(() => {});
      }
    },
    end: () => {
      // no-op
    },
  };

  const abortCtrl = registerAbortController(sessionId);

  try {
    await initAndRun({
      sessionId,
      userId: tu.userId.toString(),
      userMessage: text,
      sse,
      abortSignal: abortCtrl.signal,
      channel: "telegram",
    });
  } catch (err: any) {
    await sendMessage(chatId, `Agent error: ${err.message ?? "Unknown error"}`);
  } finally {
    abortSession(sessionId);
  }
}

// ─── Main message dispatcher ─────────────────────────────────────────

async function handleUpdate(update: any): Promise<void> {
  const msg = update.message;
  if (!msg?.text) return;

  const chatId = String(msg.chat.id);
  const tu = await getOrCreateTelegramUser(msg);
  const text = msg.text.trim();

  // Command dispatch
  if (text.startsWith("/")) {
    const [cmd, ...args] = text.split(/\s+/);
    switch (cmd) {
      case "/start":
        await handleStart(chatId, tu);
        break;
      case "/subscribe":
        await handleSubscribe(chatId, tu);
        break;
      case "/trial":
        await handleTrial(chatId, tu, args);
        break;
      case "/status":
        await handleStatus(chatId, tu);
        break;
      case "/usage":
        await handleUsage(chatId, tu);
        break;
      case "/cancel":
        await handleCancel(chatId, tu);
        break;
      case "/help":
        await handleHelp(chatId, tu);
        break;
      case "/admin":
        await handleAdmin(chatId, tu, args);
        break;
      default:
        await sendMessage(chatId, `Unknown command: \`${cmd}\`\nUse /help to see available commands.`);
    }
    return;
  }


  // Free-form message → agent
  await handleAgentMessage(chatId, tu, text);
}

// ─── Polling loop (long polling) ─────────────────────────────────────

async function pollOnce(): Promise<void> {
  if (!botToken) return;
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${botToken}/getUpdates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offset: lastUpdateId + 1,
        timeout: 25,
        allowed_updates: ["message"],
      }),
    });

    // Track Telegram rate-limiting (HTTP 429) for the admin monitor.
    if (res.status === 429) {
      rateLimitedUntil = Date.now() + 30_000;
      console.warn("[telegram] Rate limited by Telegram API (429).");
    } else {
      rateLimitedUntil = 0;
    }

    const data = await res.json() as any;
    if (!data.ok) return;

    for (const update of data.result ?? []) {
      lastUpdateId = Math.max(lastUpdateId, update.update_id);
      // Process asynchronously, don't block the poll loop.
      handleUpdate(update).catch((err) => {
        console.warn("[telegram] handleUpdate error:", err.message);
      });
    }
  } catch (err: any) {
    console.warn("[telegram] poll error:", err.message);
  }
}


/** Start the long-polling loop. Safe to call multiple times. */
export function startTelegramBot(): void {
  if (botRunning || !botToken) return;
  botRunning = true;
  console.log("[telegram] Starting Telegram bot polling...");

  const loop = async () => {
    while (botRunning) {
      await pollOnce();
      // Small delay to avoid hammering the API.
      await new Promise((r) => setTimeout(r, 500));
    }
  };
  loop().catch((err) => {
    console.error("[telegram] Polling loop crashed:", err);
    botRunning = false;
  });
}

/** Stop the polling loop. */
export function stopTelegramBot(): void {
  botRunning = false;
  console.log("[telegram] Stopped Telegram bot polling.");
}
