import crypto from "crypto";
import mongoose from "mongoose";
import { createServer } from "http";
import { createClient, RedisClientType } from "redis";
import RedisStore from "connect-redis";
import bcrypt from "bcrypt";

import { createApp, loadConfiguredPlugins } from "./app";
import { setRedisClient } from "./utils/redis/client";
import { ensureDefaultGateways } from "./services/payment.service";
import { ensureDefaultPlans } from "./services/plan.service";
import { setBotToken, startTelegramBot } from "./services/telegramBot.service";
import { initTracing } from "./utils/tracing";
import { setupShellWebSocket } from "./services/shell.socket";
import { sessionLifecycle } from "./services/session.lifecycle";
import { startAgentStateWatchdog } from "./services/agent.service";
import getSecrets from "./utils/getSecrets";
import UserModel from "./models/User/User.model";
import { logger } from "./utils/logger";

/**
 * Process lifecycle only: configuration, database/Redis connections, HTTP
 * listening, startup seeding and graceful shutdown.
 *
 * Everything HTTP-related (middleware, session, routes, health probes) lives in
 * `src/app.ts` so integration tests can mount the real API without booting this
 * process (see `backend/tests/app.http.test.ts`).
 */

// Fail fast on DB operations instead of buffering queries for 10s then timing
// out. This makes connection failures surface immediately rather than as
// confusing "buffering timed out after 10000ms" errors on every request.
mongoose.set("bufferCommands", false);

declare module "express-session" {
  export interface SessionData {
    user: { userId: string };
    environment: string;
  }
}

let redisClient: RedisClientType;

/**
 * Enforce a strong session secret.
 *
 * If none is configured we generate a random one at startup (sessions are
 * invalidated on restart, which is safer than a weak/default secret) — but only
 * in LOCAL mode. Production refuses to boot with a weak secret.
 */
async function resolveSessionSecret(deployment: string | undefined): Promise<string> {
  const configured = await getSecrets("SESS_SECRET");
  if (configured && configured.length >= 32) return configured;

  if (deployment === "LOCAL") {
    logger.warn("session secret missing or too short; generated a random one for this process", {
      deployment,
      hint: "set SESS_SECRET (>= 32 chars) in config.toml or .env for persistent sessions",
    });
    return crypto.randomBytes(48).toString("hex");
  }

  throw new Error("SESS_SECRET must be set to a strong value (>= 32 characters) in production.");
}

async function connectToDB(mongoUri: string | undefined): Promise<void> {
  if (!mongoUri) {
    throw new Error(
      "MONGO_URI not configured. Set mongo_uri in config.toml or MONGO_URI in the environment.",
    );
  }
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
  // The URI carries credentials — keep it out of structured fields.
  logger.info("mongodb connected", { host: mongoUri.replace(/\/\/[^@]*@/, "//***@") });
}

/**
 * Seed the data the UI needs to be usable on a fresh install: payment
 * gateways, default plans and at least one admin account.
 */
async function seedDefaults(): Promise<void> {
  try {
    await ensureDefaultGateways();
    logger.info("default payment gateways ensured", { scope: "payment" });
  } catch (err) {
    logger.warn("failed to seed default payment gateways", { scope: "payment", err });
  }

  try {
    await ensureDefaultPlans();
    logger.info("default plans ensured", { scope: "plans" });
  } catch (err) {
    logger.warn("failed to seed default plans", { scope: "plans", err });
  }

  // Ensure there is always at least one admin account so the admin panel can be
  // accessed. Credentials come from ADMIN_EMAIL / ADMIN_PASSWORD in
  // backend/.env. If ADMIN_PASSWORD is empty, a random temporary password is
  // generated on first boot and printed in the logs — never ship/commit a
  // default password. An existing admin is left untouched.
  try {
    const adminEmail = (await getSecrets("ADMIN_EMAIL")) || "admin@vektorsec.local";
    const existingAdmin = await UserModel.findOne({ role: "admin" });

    if (!existingAdmin) {
      let adminPassword = await getSecrets("ADMIN_PASSWORD");
      let generatedPassword = false;
      if (!adminPassword) {
        adminPassword = crypto.randomBytes(16).toString("hex");
        generatedPassword = true;
      }
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await UserModel.create({
        name: "Administrator",
        email: adminEmail,
        password: hashedPassword,
        role: "admin",
        plan: "enterprise",
        firstLogin: false,
      });

      if (generatedPassword) {
        // Intentionally NOT sent through the structured logger: the redactor
        // would mask the credential the operator needs exactly once. This line
        // is the only place a generated password is printed.
        console.log(
          `[auth] No ADMIN_PASSWORD was set. Created admin "${adminEmail}" with a random ` +
            `temporary password. Grab it from this log, log in once and change it immediately ` +
            `(never use a hardcoded default). Temporary password: ${adminPassword}`,
        );
      } else {
        logger.info("default admin account ensured", { email: adminEmail, scope: "auth" });
      }
    } else {
      logger.info("admin account already exists", { email: existingAdmin.email, scope: "auth" });
    }
  } catch (err) {
    logger.warn("failed to seed admin account", { scope: "auth", err });
  }
}

/** Reset sessions stuck in "running" state from a previous crash/restart. */
async function resetStaleSessions(): Promise<void> {
  try {
    const { default: SessionsModel } = await import("./models/Sessions/Sessions.model");
    const result = await SessionsModel.updateMany(
      { agentState: "running" },
      { $set: { agentState: "idle" } },
    );
    if (result.modifiedCount > 0) {
      logger.info("reset stale agent sessions", {
        scope: "startup",
        reset: result.modifiedCount,
      });
    }
  } catch (err) {
    logger.warn("failed to reset stale agent sessions", { scope: "startup", err });
  }
}

/** Start the Telegram bot when a token is configured. */
async function startTelegram(): Promise<void> {
  try {
    const telegramToken = await getSecrets("TELEGRAM_BOT_TOKEN");
    if (telegramToken) {
      setBotToken(telegramToken);
      startTelegramBot();
      logger.info("telegram bot configured; starting polling", { scope: "telegram" });
    } else {
      logger.info("telegram bot disabled (no TELEGRAM_BOT_TOKEN)", { scope: "telegram" });
    }
  } catch (err) {
    logger.warn("failed to start the telegram bot", { scope: "telegram", err });
  }
}

const initializeApp = async () => {
  try {
    initTracing();

    const DEPLOYMENT = await getSecrets("DEPLOYMENT");
    const MONGO_URI = await getSecrets("MONGO_URI");
    const REDIS_URL = await getSecrets("REDIS_URL");
    redisClient = createClient({ url: REDIS_URL });
    // Publish the client so application code (agent state, OOB listener, admin
    // health) can reach it without importing this module — see
    // `utils/redis/client.ts` for why that matters (testability).
    setRedisClient(redisClient);

    const sessionSecret = await resolveSessionSecret(DEPLOYMENT);
    const port = parseInt(process.env.PORT || "8081", 10);

    // Connect to MongoDB and Redis BEFORE accepting any requests so that
    // Mongoose operations never buffer for 10s then time out. If these
    // connections fail, startup throws and initializeApp() retries in 5s.
    await connectToDB(MONGO_URI);
    await redisClient.connect();
    logger.info("redis connected");

    const { app, sessionMiddleware } = createApp({
      // @ts-ignore connect-redis types do not line up with the redis v4 client
      sessionStore: new RedisStore({ client: redisClient }),
      sessionSecret,
      deployment: DEPLOYMENT,
      redisClient,
    });

    const httpServer = createServer(app);

    // WebSocket for shell streaming (replaces Socket.IO terminal handling)
    setupShellWebSocket(httpServer, sessionMiddleware);

    // Periodic sweep that force-resets sessions stuck in "running" (no live
    // process) and pauses orphaned user runs after 30s of disconnection.
    startAgentStateWatchdog();

    // Load tool plugins before accepting traffic so every registered tool is
    // available to the agent loop, the MCP gateway and the UI panel.
    await loadConfiguredPlugins();

    httpServer.listen(port, async () => {
      await seedDefaults();
      await resetStaleSessions();
      await startTelegram();

      logger.info("http server listening", { port });
    });

    process.on("SIGTERM", async () => {
      logger.info("SIGTERM received; shutting down gracefully");

      await sessionLifecycle.destroyAll();

      const memoryUsage = process.memoryUsage();
      logger.info("memory usage at shutdown", {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
      });

      httpServer.close(() => {
        logger.info("http server closed");
        process.exit(0);
      });
    });
  } catch (error) {
    logger.error("error initializing app; retrying in 5s", { err: error });
    setTimeout(() => {
      initializeApp();
    }, 5000);
  }
};

initializeApp().catch((error) => {
  logger.error("failed to initialize server", { err: error });
});
