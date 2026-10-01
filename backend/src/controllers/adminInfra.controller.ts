import { Request, Response } from "express";
import os from "os";
import mongoose from "mongoose";
import NotificationLog from "../models/NotificationLog/NotificationLog.model";
import { getCaidoHealth } from "../services/caido.client";
import { getRedisClientOrNull } from "../utils/redis/client";
import {
  isBotConfigured,
  isBotRunning,
  isBotRateLimited,
  getRateLimitedUntil,
  getBotInfo,
  getWebhookInfo,
  setTelegramWebhook,
  broadcastMessage,
  setBotToken,
  stopTelegramBot,
  startTelegramBot,
} from "../services/telegramBot.service";
import { listActiveAgentSessions, abortSession } from "../services/agent.service";
import { getTaskQueue } from "../services/taskQueue";
import SessionsModel from "../models/Sessions/Sessions.model";
import TelegramUser from "../models/TelegramUser/TelegramUser.model";
import UsageRecordModel from "../models/UsageRecord/UsageRecord.model";
import PlanModel from "../models/Plan/Plan.model";
import { logAuditFromRequest } from "../services/audit.service";
import { readEnvFile, updateEnvVars } from "../utils/envWriter";
import { reloadEnv } from "../utils/loadConfig";



// ─── Telegram Bot Status ─────────────────────────────────────────────

/** GET /admin/infra/telegram — full bot health + identity + webhook + user count. */
export const getTelegramStatus = async (_req: Request, res: Response) => {
  try {
    const [botInfo, webhookInfo, userCount, totalUsers] = await Promise.all([
      getBotInfo(),
      getWebhookInfo(),
      TelegramUser.countDocuments(),
      SessionsModel.countDocuments({}),
    ]);

    return res.status(200).json({
      configured: isBotConfigured(),
      running: isBotRunning(),
      rateLimited: isBotRateLimited(),
      rateLimitedUntil: getRateLimitedUntil(),
      botInfo,
      webhook: webhookInfo,
      telegramUsers: userCount,
      totalSessions: totalUsers,
    });
  } catch (err: any) {
    console.error("[adminInfra] getTelegramStatus error:", err);
    return res.status(500).json({ message: "Failed to get telegram status" });
  }
};

/** POST /admin/infra/telegram/test — verify the bot token via getMe. */
export const testTelegramConnection = async (req: Request, res: Response) => {
  try {
    const { token } = req.body || {};
    const info = token && typeof token === "string"
      ? await fetch(`https://api.telegram.org/bot${token.trim()}/getMe`).then((r) => r.json()).catch(() => null)
      : await getBotInfo();

    if (!info || !info.ok) {
      return res.status(200).json({
        success: false,
        message: info?.description || "Connection failed — invalid token or network error",
      });
    }

    await logAuditFromRequest(req, res, "admin.telegram_test", {
      resourceType: "telegram",
      details: { username: info.result?.username },
    });

    return res.status(200).json({
      success: true,
      message: "Connected to Telegram API successfully",
      bot: {
        id: info.result?.id,
        username: info.result?.username,
        firstName: info.result?.first_name,
      },
    });
  } catch (err: any) {
    console.error("[adminInfra] testTelegramConnection error:", err);
    return res.status(500).json({ success: false, message: "Failed to test connection" });
  }
};

/** POST /admin/infra/telegram/webhook — set (or clear) the webhook URL. */
export const setTelegramWebhookHandler = async (req: Request, res: Response) => {
  try {
    const { url } = req.body || {};
    const urlStr = typeof url === "string" ? url.trim() : "";

    if (urlStr && !/^https:\/\//.test(urlStr)) {
      return res.status(400).json({ message: "Webhook URL must start with https:// (empty to clear)" });
    }

    const result = await setTelegramWebhook(urlStr);
    if (result === null && isBotConfigured()) {
      return res.status(400).json({ message: "Failed to set webhook — check bot token" });
    }

    await logAuditFromRequest(req, res, "admin.telegram_webhook", {
      resourceType: "telegram",
      details: { url: urlStr || "(cleared)" },
    });

    return res.status(200).json({
      message: urlStr ? "Webhook set successfully" : "Webhook cleared",
      result,
    });
  } catch (err: any) {
    console.error("[adminInfra] setTelegramWebhookHandler error:", err);
    return res.status(500).json({ message: "Failed to set webhook" });
  }
};

/** POST /admin/infra/telegram/broadcast — send a message to every Telegram user. */
export const broadcastToTelegramUsers = async (req: Request, res: Response) => {
  try {
    const { message } = req.body || {};
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ message: "message is required" });
    }

    const totalUsers = await TelegramUser.countDocuments();
    const { sent, failed } = await broadcastMessage(message.trim());

    await logAuditFromRequest(req, res, "admin.telegram_broadcast", {
      resourceType: "telegram",
      details: { messageLength: message.length, sent, failed },
    });

    return res.status(200).json({
      message: `Broadcast complete: ${sent} sent, ${failed} failed (${totalUsers} total users)`,
      sent,
      failed,
      total: totalUsers,
    });
  } catch (err: any) {
    console.error("[adminInfra] broadcastToTelegramUsers error:", err);
    return res.status(500).json({ message: "Failed to broadcast message" });
  }
};

/** GET /admin/infra/telegram/users — list Telegram users. */
export const listTelegramUsersAdmin = async (_req: Request, res: Response) => {
  try {
    const users = await TelegramUser.find()
      .sort({ lastSeenAt: -1 })
      .limit(200)
      .select("telegramId chatId username firstName lastName linked lastSeenAt createdAt");
    return res.status(200).json({ users });
  } catch (err: any) {
    console.error("[adminInfra] listTelegramUsersAdmin error:", err);
    return res.status(500).json({ message: "Failed to list telegram users" });
  }
};

// ─── Active Sessions / Task Monitor ─────────────────────────────────

/** GET /admin/infra/tasks — active agent sessions + task queue + queue stats. */
export const getActiveTasks = async (_req: Request, res: Response) => {
  try {
    const activeSessions = listActiveAgentSessions();
    const queue = getTaskQueue();
    const queueStats = queue.getStats();
    const queueTasks = queue.listTasks().map((t) => ({
      id: t.id,
      type: t.type,
      sessionId: t.sessionId,
      userId: t.userId ?? null,
      priority: t.priority,
      status: t.status,
      progress: t.progress,
      createdAt: t.createdAt,
      startedAt: t.startedAt ?? null,
      completedAt: t.completedAt ?? null,
      error: t.error ?? null,
      tags: t.tags,
      outputLength: (t.output ?? []).join("").length,
    }));

    // Resolve session metadata (name, user) for active sessions.
    const sessionIds = activeSessions.map((s) => s.sessionId);
    const sessionDocs = sessionIds.length
      ? await SessionsModel.find({ sessionId: { $in: sessionIds } }).select("sessionId name agentState createdAt")
      : [];
    const sessionMap = new Map(sessionDocs.map((s) => [s.sessionId, s]));

    const sessions = activeSessions.map((s) => {
      const doc = sessionMap.get(s.sessionId);
      return {
        sessionId: s.sessionId,
        name: doc?.name ?? "Unknown session",
        agentState: doc?.agentState ?? "running",
        createdAt: doc?.createdAt ?? null,
        activeSince: s.activeSince,
      };
    });

    return res.status(200).json({
      sessions,
      queue: {
        stats: queueStats,
        tasks: queueTasks,
      },
    });
  } catch (err: any) {
    console.error("[adminInfra] getActiveTasks error:", err);
    return res.status(500).json({ message: "Failed to get active tasks" });
  }
};

/** POST /admin/infra/sessions/:sessionId/abort — force stop a running session. */
export const abortSessionHandler = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ message: "sessionId is required" });
    }

    abortSession(sessionId);

    await logAuditFromRequest(req, res, "admin.session_aborted", {
      resourceType: "session",
      resourceId: sessionId,
      details: { action: "force_stop" },
    });

    return res.status(200).json({ message: `Session ${sessionId} aborted (force stop)` });
  } catch (err: any) {
    console.error("[adminInfra] abortSessionHandler error:", err);
    return res.status(500).json({ message: "Failed to abort session" });
  }
};

/** POST /admin/infra/queue/:taskId/cancel — cancel a queued task. */
export const cancelQueuedTask = async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const queue = getTaskQueue();
    const cancelled = queue.cancel(taskId);

    await logAuditFromRequest(req, res, "admin.task_cancelled", {
      resourceType: "task",
      resourceId: taskId,
      details: { action: "cancel" },
    });

    if (!cancelled) {
      return res.status(404).json({ message: "Task not found or already running (only queued tasks can be cancelled)" });
    }

    return res.status(200).json({ message: `Task ${taskId} cancelled` });
  } catch (err: any) {
    console.error("[adminInfra] cancelQueuedTask error:", err);
    return res.status(500).json({ message: "Failed to cancel task" });
  }
};

// ─── System Resource Monitor ────────────────────────────────────────

/** GET /admin/infra/system — CPU / RAM / disk / uptime + load. */
export const getSystemResource = async (_req: Request, res: Response) => {
  try {
    const cpus = os.cpus();
    const cpuModel = cpus[0]?.model ?? "unknown";
    const cpuCount = cpus.length;
    const loadAvg = os.loadavg();

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    let disk: any = null;
    try {
      const { execSync } = await import("child_process");
      const out = execSync("df -k / 2>/dev/null || df -k . 2>/dev/null", { encoding: "utf8", timeout: 5000 });
      const line = out.trim().split("\n").pop();
      const parts = line?.split(/\s+/);
      if (parts && parts.length >= 5) {
        const totalKb = parseInt(parts[1], 10);
        const usedKb = parseInt(parts[2], 10);
        const availKb = parseInt(parts[3], 10);
        disk = {
          totalGb: +(totalKb / 1024 / 1024).toFixed(2),
          usedGb: +(usedKb / 1024 / 1024).toFixed(2),
          freeGb: +(availKb / 1024 / 1024).toFixed(2),
          usagePct: totalKb > 0 ? +((usedKb / totalKb) * 100).toFixed(1) : 0,
          mount: parts[5] ?? "/",
        };
      }
    } catch {
      // df may not be available on all platforms — fall back to os-based info.
    }

    return res.status(200).json({
      platform: `${os.type()} ${os.release()}`,
      hostname: os.hostname(),
      arch: os.arch(),
      uptimeSec: Math.floor(os.uptime()),
      cpu: {
        model: cpuModel,
        cores: cpuCount,
        loadAvg: loadAvg.length ? loadAvg.map((l) => +l.toFixed(2)) : [],
      },
      memory: {
        totalGb: +(totalMem / 1024 / 1024 / 1024).toFixed(2),
        usedGb: +(usedMem / 1024 / 1024 / 1024).toFixed(2),
        freeGb: +(freeMem / 1024 / 1024 / 1024).toFixed(2),
        usagePct: totalMem > 0 ? +((usedMem / totalMem) * 100).toFixed(1) : 0,
      },
      disk,
      nodeVersion: process.version,
      pid: process.pid,
    });
  } catch (err: any) {
    console.error("[adminInfra] getSystemResource error:", err);
    return res.status(500).json({ message: "Failed to get system resource info" });
  }
};

// ─── Bot Token / Start / Stop Control ───────────────────────────────

/**
 * POST /admin/infra/telegram/token
 * Save a new Telegram bot token to .env and (re)start the bot.
 * The token is persisted so it survives restarts.
 */
export const saveTelegramBotToken = async (req: Request, res: Response) => {
  try {
    const { token } = req.body || {};
    if (!token || typeof token !== "string" || !token.trim()) {
      return res.status(400).json({ message: "token is required" });
    }
    const trimmed = token.trim();

    // Persist to .env so it survives a restart.
    updateEnvVars({ TELEGRAM_BOT_TOKEN: trimmed });
    reloadEnv();

    // Apply to the in-memory bot service.
    setBotToken(trimmed);
    stopTelegramBot();
    startTelegramBot();

    await logAuditFromRequest(req, res, "admin.telegram_token_saved", {
      resourceType: "telegram",
      details: { tokenLength: trimmed.length, restarted: true },
    });

    return res.status(200).json({
      message: "Bot token saved and bot restarted",
      configured: isBotConfigured(),
      running: isBotRunning(),
    });
  } catch (err: any) {
    console.error("[adminInfra] saveTelegramBotToken error:", err);
    return res.status(500).json({ message: "Failed to save bot token" });
  }
};

/** POST /admin/infra/telegram/start — start the bot polling loop. */
export const startTelegramBotHandler = async (req: Request, res: Response) => {
  try {
    if (!isBotConfigured()) {
      return res.status(400).json({ message: "No bot token configured. Save a token first." });
    }
    startTelegramBot();
    await logAuditFromRequest(req, res, "admin.telegram_bot_started", {
      resourceType: "telegram",
    });
    return res.status(200).json({ message: "Telegram bot started", running: isBotRunning() });
  } catch (err: any) {
    console.error("[adminInfra] startTelegramBotHandler error:", err);
    return res.status(500).json({ message: "Failed to start bot" });
  }
};

/** POST /admin/infra/telegram/stop — stop the bot polling loop. */
export const stopTelegramBotHandler = async (req: Request, res: Response) => {
  try {
    stopTelegramBot();
    await logAuditFromRequest(req, res, "admin.telegram_bot_stopped", {
      resourceType: "telegram",
    });
    return res.status(200).json({ message: "Telegram bot stopped", running: isBotRunning() });
  } catch (err: any) {
    console.error("[adminInfra] stopTelegramBotHandler error:", err);
    return res.status(500).json({ message: "Failed to stop bot" });
  }
};

/** GET /admin/infra/telegram/commands — list of bot slash commands. */
export const getTelegramCommands = async (_req: Request, res: Response) => {
  const commands = [
    { command: "/start", description: "เริ่มใช้งาน VektorSec / Start the VektorSec bot and get help." },
    { command: "/help", description: "แสดงคำสั่งทั้งหมด / Show all commands." },
    { command: "/scan", description: "รันการสแกน (nmap, zap, nuclei ฯลฯ)" },
    { command: "/status", description: "แสดงสถานะ Task / Session ปัจจุบัน" },
    { command: "/report", description: "สร้างรายงานผลการสแกน" },
    { command: "/link", description: "เชื่อมบัญชี Platform กับ Telegram" },
    { command: "/stop", description: "หยุด Task ที่กำลังรันอยู่" },
    { command: "/usage", description: "แสดงการใช้งานโควต้า / จำนวนครั้งที่ใช้ไป" },
  ];
  return res.status(200).json({ commands });
};

// ─── Execution Logs ─────────────────────────────────────────────────

/**
 * GET /admin/infra/executions
 * Browse recent tool executions (run-security-tool, run-async-task etc.)
 * across all sessions — history of commands users have run and their status.
 */
export const getExecutionLogs = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));

    const match: any = {
      // Only look at sessions that contain tool messages
      "messages.role": "tool",
    };

    const pipeline: any[] = [
      { $match: match },
      { $sort: { createdAt: -1 } },
      { $project: { _id: 0, sessionId: 1, name: 1, messages: 1 } },
    ];

    const [sessions, total] = await Promise.all([
      SessionsModel.aggregate(pipeline).skip((page - 1) * limit).limit(limit),
      SessionsModel.countDocuments({ "messages.role": "tool" }),
    ]);

    // Flatten tool messages into a log stream.
    const logs: any[] = [];
    for (const s of sessions) {
      for (const m of s.messages ?? []) {
        if (m.role !== "tool") continue;
        logs.push({
          sessionId: s.sessionId,
          sessionName: s.name ?? "Unknown session",
          timestamp: m.timestamp ?? s.createdAt,
          toolName: m.toolName ?? "unknown",
          toolCallId: m.toolCallId ?? "",
          content: typeof m.content === "string" ? m.content.slice(0, 500) : "",
        });
      }
    }

    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return res.status(200).json({
      logs: logs.slice(0, limit),
      total,
      page,
      limit,
    });
  } catch (err: any) {
    console.error("[adminInfra] getExecutionLogs error:", err);
    return res.status(500).json({ message: "Failed to get execution logs" });
  }
};

// ─── Execution Quotas / Rate Limits (per plan) ─────────────────────

/**
 * GET /admin/infra/quotas
 * List every plan with its daily execution/token quotas so admins can
 * enforce rate limits per plan (e.g. Free: 3 scans/day, Premium: unlimited).
 */
export const getExecutionQuotas = async (_req: Request, res: Response) => {
  try {
    const plans = await PlanModel.find().sort({ sortOrder: 1 }).lean();
    return res.status(200).json({
      quotas: plans.map((p: any) => ({
        planId: p.planId,
        name: p.name,
        enabled: p.enabled,
        maxRequestsPerDay: p.limits?.maxRequestsPerDay ?? 0,
        maxTokensPerDay: p.limits?.maxTokensPerDay ?? 0,
        maxConcurrentSessions: p.limits?.maxConcurrentSessions ?? 1,
        maxSessionsPerPeriod: p.limits?.maxSessionsPerPeriod ?? 0,
      })),
    });
  } catch (err: any) {
    console.error("[adminInfra] getExecutionQuotas error:", err);
    return res.status(500).json({ message: "Failed to get execution quotas" });
  }
};

/**
 * PUT /admin/infra/quotas/:planId
 * Update the daily execution quota for a plan.
 */
export const updateExecutionQuotas = async (req: Request, res: Response) => {
  try {
    const { planId } = req.params;
    const { maxRequestsPerDay, maxTokensPerDay, maxConcurrentSessions } = req.body ?? {};

    const plan = await PlanModel.findOne({ planId });
    if (!plan) {
      return res.status(404).json({ message: `Plan "${planId}" not found` });
    }

    if (typeof maxRequestsPerDay === "number") plan.limits.maxRequestsPerDay = maxRequestsPerDay;
    if (typeof maxTokensPerDay === "number") plan.limits.maxTokensPerDay = maxTokensPerDay;
    if (typeof maxConcurrentSessions === "number") plan.limits.maxConcurrentSessions = maxConcurrentSessions;
    await plan.save();

    await logAuditFromRequest(req, res, "admin.execution_quota_updated", {
      resourceType: "plan",
      resourceId: planId,
      details: { maxRequestsPerDay, maxTokensPerDay, maxConcurrentSessions },
    });

    return res.status(200).json({
      message: `Quota updated for plan "${planId}"`,
      planId,
      maxRequestsPerDay: plan.limits.maxRequestsPerDay,
      maxTokensPerDay: plan.limits.maxTokensPerDay,
      maxConcurrentSessions: plan.limits.maxConcurrentSessions,
    });
  } catch (err: any) {
    console.error("[adminInfra] updateExecutionQuotas error:", err);
    return res.status(500).json({ message: "Failed to update execution quota" });
  }
};

// ─── Analytics / Operations Metrics ────────────────────────────────

/**
 * GET /admin/infra/analytics
 * Pentest-focused analytics:
 *  - Total pentest tasks (tool executions across all sessions)
 *  - Active bot users in the last 24h
 *  - LLM / API token usage & cost (from UsageRecord, last 30 days)
 */
export const getPentestAnalytics = async (req: Request, res: Response) => {
  try {
    const days = Math.min(90, Math.max(1, parseInt(String(req.query.days ?? "30"), 10) || 30));

    // Total tool executions (pentest tasks) — count every tool message ever.
    const [totalTasks, toolTasks24h] = await Promise.all([
      SessionsModel.countDocuments({ "messages.role": "tool" }),
      SessionsModel.countDocuments({
        "messages.role": "tool",
        "messages.timestamp": { $gte: new Date(Date.now() - 24 * 3600 * 1000) },
      }),
    ]);

    // Active Telegram bot users in last 24h.
    const activeBotUsers24h = await TelegramUser.countDocuments({
      lastSeenAt: { $gte: new Date(Date.now() - 24 * 3600 * 1000) },
    });

    // Usage records over the last N days (all channels).
    const since = new Date();
    since.setDate(since.getDate() - days);
    const dateKey = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-${String(
      since.getDate(),
    ).padStart(2, "0")}`;

    const usageRecords = await UsageRecordModel.find({ date: { $gte: dateKey } });

    const summary = usageRecords.reduce(
      (acc, r) => {
        acc.requests += r.requests ?? 0;
        acc.tokensIn += r.tokensIn ?? 0;
        acc.tokensOut += r.tokensOut ?? 0;
        acc.costUsd += r.costUsd ?? 0;
        return acc;
      },
      { requests: 0, tokensIn: 0, tokensOut: 0, costUsd: 0 },
    );

    const byChannel: Record<string, { requests: number; tokensIn: number; tokensOut: number; costUsd: number }> = {};
    for (const r of usageRecords) {
      const c = byChannel[r.channel] ?? (byChannel[r.channel] = { requests: 0, tokensIn: 0, tokensOut: 0, costUsd: 0 });
      c.requests += r.requests ?? 0;
      c.tokensIn += r.tokensIn ?? 0;
      c.tokensOut += r.tokensOut ?? 0;
      c.costUsd += r.costUsd ?? 0;
    }

    // Today's usage (for the "today" cards).
    const todayKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(
      new Date().getDate(),
    ).padStart(2, "0")}`;
    const todayRecords = await UsageRecordModel.find({ date: todayKey });
    const today = todayRecords.reduce(
      (acc, r) => {
        acc.requests += r.requests ?? 0;
        acc.tokensIn += r.tokensIn ?? 0;
        acc.tokensOut += r.tokensOut ?? 0;
        acc.costUsd += r.costUsd ?? 0;
        return acc;
      },
      { requests: 0, tokensIn: 0, tokensOut: 0, costUsd: 0 },
    );

    return res.status(200).json({
      totalPentestTasks: totalTasks,
      pentestTasks24h: toolTasks24h,
      activeBotUsers24h: activeBotUsers24h,
      totalTelegramUsers: await TelegramUser.countDocuments(),
      llmUsage: {
        days,
        requests: summary.requests,
        tokensIn: summary.tokensIn,
        tokensOut: summary.tokensOut,
        totalTokens: summary.tokensIn + summary.tokensOut,
        costUsd: +summary.costUsd.toFixed(4),
        byChannel,
      },
      today: {
        requests: today.requests,
        tokensIn: today.tokensIn,
        tokensOut: today.tokensOut,
        totalTokens: today.tokensIn + today.tokensOut,
        costUsd: +today.costUsd.toFixed(4),
      },
    });
  } catch (err: any) {
    console.error("[adminInfra] getPentestAnalytics error:", err);
    return res.status(500).json({ message: "Failed to get pentest analytics" });
  }
};




// ─── System Health ─────────────────────────────────────────────────

/**
 * GET /admin/infra/health
 * Full platform health snapshot for the admin System Health page:
 * MongoDB, Redis, backend process, Telegram bot, LLM providers,
 * Burp, Caido and the SSH exploit box.
 */
export const getSystemHealth = async (_req: Request, res: Response) => {
  const startedAt = Date.now();
  try {
    const env = readEnvFile();

    // MongoDB
    const mongoState = mongoose.connection.readyState; // 0..3
    const mongoOk = mongoState === 1;

    // Redis
    let redisOk = false;
    let redisDetails: Record<string, string> = { state: "disconnected" };
    try {
      const redisClient = getRedisClientOrNull();
      if (redisClient && (redisClient as any).isOpen) {
        const t0 = Date.now();
        await redisClient.ping();
        redisOk = true;
        redisDetails = { state: "connected", latency: `${Date.now() - t0} ms` };
      }
    } catch (redisErr: any) {
      redisOk = false;
      redisDetails = { state: "error", latency: redisErr?.message ?? "ping failed" };
    }

    // Backend process
    const memRssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const uptimeMin = Math.max(1, Math.floor(process.uptime() / 60));

    // Telegram bot
    const telegramConfigured = isBotConfigured();
    const telegramRunning = isBotRunning();

    // LLM providers (from the runtime .env)
    const PROVIDER_KEYS: [string, string][] = [
      ["OPENAI_API_KEY", "OpenAI"],
      ["ANTHROPIC_API_KEY", "Anthropic"],
      ["DEEPSEEK_API_KEY", "DeepSeek"],
    ];
    const llmConfigured = PROVIDER_KEYS.filter(([key]) => Boolean(env[key]));

    // Caido
    let caidoHealth: any = { configured: false, connected: false };
    try {
      caidoHealth = await getCaidoHealth();
    } catch {
      // keep defaults
    }

    // Burp + exploit box (static config check)
    const burpConfigured = Boolean(env.BURP_RPC_HOST || env.BURP_RPC_PORT);
    const sshConfigured = Boolean(env.SSH_HOST);


    const services = [
      {
        id: "mongo",
        name: "MongoDB",
        status: mongoOk ? "healthy" : "critical",
        details: mongoOk
          ? { state: "connected", database: "vektorsec" }
          : { state: "disconnected", note: "DB connection is down" },
      },
      {
        id: "redis",
        name: "Redis",
        status: redisOk ? "healthy" : "critical",
        details: redisDetails,
      },
      {
        id: "backend",
        name: "Backend API",
        status: "healthy",
        details: { uptime: `${uptimeMin} min`, memory: `${memRssMb} MB`, node: process.version },
      },
      {
        id: "telegram",
        name: "Telegram Bot",
        status:
          telegramConfigured && telegramRunning
            ? "healthy"
            : telegramConfigured
              ? "degraded"
              : "offline",
        details: {
          configured: telegramConfigured ? "Yes" : "No",
          running: telegramRunning ? "Yes" : "No",
        },
      },
      {
        id: "llm",
        name: "LLM API Gateway",
        status: llmConfigured.length > 0 ? "healthy" : "critical",
        details:
          llmConfigured.length > 0
            ? Object.fromEntries(llmConfigured.map(([key, label]) => [label, "Configured"]))
            : { note: "No provider keys configured" },
      },
      {
        id: "caido",
        name: "Caido",
        status: caidoHealth.connected ? "healthy" : caidoHealth.configured ? "degraded" : "offline",
        details: caidoHealth.connected
          ? { url: caidoHealth.url ?? "-", state: "connected" }
          : { message: caidoHealth.message ?? "Not configured" },
      },
      {
        id: "burp",
        name: "Burp Suite RPC",
        status: burpConfigured ? "degraded" : "offline",
        details: burpConfigured
          ? { host: env.BURP_RPC_HOST || "-", port: env.BURP_RPC_PORT || "-" }
          : { message: "Not configured" },
      },
      {
        id: "exploitbox",
        name: "Exploit Box (SSH)",
        status: sshConfigured ? "healthy" : "offline",
        details: sshConfigured ? { host: env.SSH_HOST } : { message: "Not configured (use built-in Kali)" },
      },
    ];

    const counts = { healthy: 0, degraded: 0, critical: 0 };
    services.forEach((s) => {
      const key = s.status as keyof typeof counts;
      counts[key] = (counts[key] || 0) + 1;
    });
    let overall: "healthy" | "degraded" | "critical" = "healthy";
    if (counts.critical > 0) overall = "critical";
    else if (counts.degraded > 0) overall = "degraded";

    // Queue load proxy: sessions relative to a nominal capacity of 20.
    let totalSessions = 0;
    try {
      totalSessions = await SessionsModel.countDocuments({});
    } catch {
      totalSessions = 0;
    }
    const queueLoadPct = Math.min(100, Math.round((totalSessions / 20) * 100));

    return res.status(200).json({
      overall,
      totalWorkers: 1,
      queueLoadPct,
      apiResponseMs: Date.now() - startedAt,
      services,
      refreshedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[adminInfra] getSystemHealth error:", err);
    return res.status(500).json({ message: "Failed to get system health" });
  }
};

// ─── Notification Logs ─────────────────────────────────────────────

/**
 * GET /admin/infra/notifications
 * Browse recent notification delivery logs (telegram messages, broadcasts, etc.)
 * Supports channel / status filters and pagination.
 */
export const getNotificationLogs = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
    const channel = String(req.query.channel ?? "").trim();
    const status = String(req.query.status ?? "").trim();

    const match: any = {};
    if (channel && channel !== "all") match.channel = channel;
    if (status && status !== "all") match.status = status;

    const [docs, total] = await Promise.all([
      NotificationLog.find(match)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      NotificationLog.countDocuments(match),
    ]);

    const logs = docs.map((d) => ({
      id: d._id?.toString() ?? String(d.createdAt),
      timestamp: d.createdAt,
      channel: d.channel,
      recipient: d.recipient,
      type: d.type,
      status: d.status,
      payload: d.payload ?? {},
      error: d.error ?? null,
    }));

    return res.status(200).json({ logs, total, page, limit });
  } catch (err: any) {
    console.error("[adminInfra] getNotificationLogs error:", err);
    return res.status(500).json({ message: "Failed to get notification logs" });
  }
};

