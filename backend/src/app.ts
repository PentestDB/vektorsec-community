import express, { RequestHandler } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import session, { Store } from "express-session";
import mongoose from "mongoose";
import multer from "multer";
const mongoSanitize = require("express-mongo-sanitize");

import { authRoutes } from "./routes/auth.routes";
import { taskRoutes } from "./routes/task.routes";
import { userRoutes } from "./routes/user.routes";
import { agentRoutes } from "./routes/agent.routes";
import { shellRoutes } from "./routes/shell.routes";
import { vpnRoutes } from "./routes/vpn.routes";
import { vncRoutes } from "./routes/vnc.routes";
import { burpRoutes } from "./routes/burp.routes";
import { caidoRoutes } from "./routes/caido.routes";
import { mythicRoutes } from "./routes/mythic.routes";
import { ctfRoutes } from "./routes/ctf.routes";
import { workspaceRoutes } from "./routes/workspace.routes";
import { mcpRoutes } from "./routes/mcp.routes";
import { mcpHttpRoutes } from "./routes/mcp-http.routes";
import { billingRoutes } from "./routes/billing.routes";
import { paymentRoutes } from "./routes/payment.routes";
import { planRoutes } from "./routes/plan.routes";
import { subscriptionRoutes } from "./routes/subscription.routes";
import { telegramBotRoutes } from "./routes/telegramBot.routes";
import adminRoutes from "./routes/admin.routes";
import { announcementRoutes } from "./routes/announcement.routes";
import { blogRoutes } from "./routes/blog.routes";
import { menuRoutes } from "./routes/menu.routes";
import { oobRoutes } from "./routes/oob.routes";
import { publicRoutes } from "./routes/public.routes";

import { apiRateLimiter } from "./middlewares/RateLimit.middleware";
import { loadPlugins } from "./tools/plugin-loader";
import getSecrets from "./utils/getSecrets";
import { logger } from "./utils/logger";

/**
 * HTTP application factory.
 *
 * `server.ts` owns the process lifecycle (config, MongoDB/Redis connections,
 * listening, seeding, graceful shutdown); this module owns the Express wiring so
 * it can be mounted by integration tests without booting the whole process.
 */

export interface CreateAppOptions {
  /** Session store — Redis in production, an in-memory store in tests. */
  sessionStore: Store;
  /** Validated session secret (>= 32 chars). */
  sessionSecret: string;
  /** `"LOCAL"` disables secure cookies; anything else requires HTTPS. */
  deployment?: string;
  /** Extra allowed origins, comma separated (defaults to `CORS_ORIGINS`). */
  corsOrigins?: string;
  /**
   * Client used by `GET /api/ready` to ping Redis. When omitted, readiness only
   * checks MongoDB and reports Redis as "not configured".
   */
  redisClient?: { ping(): Promise<string> };
}

export interface CreatedApp {
  app: express.Express;
  /** Also needed to auth the WebSocket upgrade (`setupShellWebSocket`). */
  sessionMiddleware: RequestHandler;
}

const DEFAULT_CORS_ORIGINS = [
  "http://127.0.0.1:8081",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:3003",
  "http://127.0.0.1:5000",
  "http://localhost:8081",
  "http://localhost:5000",
  "http://localhost:3003",
  "http://localhost:3001",
];

/** Build the CORS options (local defaults + any extra configured origins). */
export function buildCorsOptions(extraOrigins?: string) {
  const raw = extraOrigins ?? process.env.CORS_ORIGINS;
  const origins = raw
    ? [...DEFAULT_CORS_ORIGINS, ...raw.split(",").map((o) => o.trim()).filter(Boolean)]
    : DEFAULT_CORS_ORIGINS;

  return {
    origin: origins,
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "X-Access-Token",
      "Authorization",
      "Access-Control-Allow-Origin",
      "Access-Control-Allow-Credentials",
      "Access-Control-Allow-Headers",
      "x-csrf-token",
      "Set-Cookie",
    ],
    credentials: true,
    methods: "GET,HEAD,OPTIONS,PUT,PATCH,POST,DELETE",
  };
}

/** Session middleware with the project's cookie policy. */
export function buildSessionMiddleware(options: {
  sessionStore: Store;
  sessionSecret: string;
  deployment?: string;
}): RequestHandler {
  return session({
    secret: options.sessionSecret,
    resave: false,
    name: "sid",
    saveUninitialized: false,
    proxy: true,
    store: options.sessionStore,
    cookie: {
      sameSite: true as const,
      secure: options.deployment === "LOCAL" ? false : true,
      maxAge: 1000 * 60 * 60 * 12,
    },
  });
}

/**
 * Load tool plugins unless the caller opted out. Never throws: a broken plugin
 * is reported and skipped (see `tools/plugin-loader.ts`).
 */
export async function loadConfiguredPlugins(): Promise<void> {
  try {
    const result = await loadPlugins({ log: () => {} });

    if (!result.directoryFound) {
      logger.debug("no tool plugin directory; skipping", { directory: result.directory });
      return;
    }
    if (result.scanned === 0) {
      logger.debug("no tool plugins found", { directory: result.directory });
      return;
    }

    logger.info("tool plugins loaded", {
      directory: result.directory,
      scanned: result.scanned,
      loaded: result.loaded,
      failed: result.failed,
    });

    for (const plugin of result.plugins) {
      if (plugin.ok && plugin.registered.length > 0) {
        logger.info("plugin registered tools", { file: plugin.file, tools: plugin.registered });
      }
      if (!plugin.ok) {
        logger.warn("plugin failed to load", { file: plugin.file, error: plugin.error });
      }
    }
  } catch (err: any) {
    logger.warn("plugin loader crashed; continuing without plugins", { err });
  }
}

/**
 * Build the Express application: security middleware, session, health probes,
 * every route mount and the error handler.
 */
export function createApp(options: CreateAppOptions): CreatedApp {
  const app = express();

  const corsOptions = buildCorsOptions(options.corsOrigins);
  app.use(cors(corsOptions));
  app.options("*", cors(corsOptions));

  app.use(express.urlencoded({ extended: true }));

  app.use((req, res, next) => {
    express.json({
      limit: "5mb",
      type: ["application/json", "text/plain"],
    })(req, res, (err) => {
      if (err) {
        logger.warn("rejected request with invalid JSON body", {
          method: req.method,
          path: req.originalUrl,
        });
        return res.status(400).json({ message: "Invalid JSON" });
      }
      next();
    });
  });

  app.use(cookieParser());
  app.use(mongoSanitize());

  // Global API rate limiting (applies to all /api routes)
  app.use("/api", apiRateLimiter);

  const sessionMiddleware = buildSessionMiddleware({
    sessionStore: options.sessionStore,
    sessionSecret: options.sessionSecret,
    deployment: options.deployment,
  });
  app.use(sessionMiddleware);

  app.get("/", (_req, res) => {
    res.send("Hello World!");
  });

  // Liveness: process is up (no dependency checks) — used by Docker/gateway.
  app.get("/api/healthcheck", (_req, res) => {
    res.status(200).send("OK");
  });

  // Readiness: dependencies the agent runtime cannot work without. Kept
  // separate from the liveness probe so a DB/Redis outage marks the instance
  // "not ready" instead of restarting the container.
  app.get("/api/ready", async (_req, res) => {
    const mongoState = mongoose.connection.readyState; // 1 = connected
    const checks: Record<string, { ok: boolean; detail?: string }> = {
      mongo: {
        ok: mongoState === 1,
        detail: mongoState === 1 ? "connected" : `readyState=${mongoState}`,
      },
      redis: options.redisClient
        ? { ok: false, detail: "unknown" }
        : { ok: false, detail: "not configured" },
    };

    if (options.redisClient) {
      try {
        const pong = await options.redisClient.ping();
        checks.redis = { ok: pong === "PONG", detail: pong };
      } catch (err: any) {
        checks.redis = { ok: false, detail: err?.message ?? "ping failed" };
      }
    }

    const ready = Object.values(checks).every((check) => check.ok);
    return res.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "not-ready",
      checks,
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  app.get("/api/test/google-search", async (_req, res) => {
    try {
      const apiKey = await getSecrets("GOOGLE-API-KEY");
      const cx = await getSecrets("CUSTOM-SEARCH-ENGINE-ID");

      if (!apiKey || !cx) {
        const missing = [!apiKey && "GOOGLE-API-KEY", !cx && "CUSTOM-SEARCH-ENGINE-ID"].filter(Boolean);
        console.error("[Google Search Test] Missing env vars:", missing.join(", "));
        return res
          .status(500)
          .json({ success: false, error: `Missing configuration: ${missing.join(", ")}` });
      }

      const { google: googleapis } = require("googleapis");
      const customSearch = googleapis.customsearch("v1");
      const result = await customSearch.cse.list({ auth: apiKey, cx, q: "test", num: 1 });

      const items = result.data.items ?? [];
      console.log("[Google Search Test] Success -", items.length, "result(s) returned");
      return res.status(200).json({ success: true, resultCount: items.length, items });
    } catch (err: any) {
      console.error("[Google Search Test] Error:", err.message);
      if (err?.response?.data) {
        console.error("[Google Search Test] API response:", JSON.stringify(err.response.data, null, 2));
      }
      return res.status(500).json({
        success: false,
        error: err.message,
        details: err?.response?.data || null,
      });
    }
  });

  // Routes
  app.use("/api/auth", authRoutes);
  app.use("/api/task", taskRoutes);
  app.use("/api/user", userRoutes);
  app.use("/api/agent", agentRoutes);
  app.use("/api/shell", shellRoutes);
  app.use("/api/copilot", vpnRoutes);
  app.use("/api/copilot", vncRoutes);
  app.use("/api/burp", burpRoutes);
  app.use("/api/caido", caidoRoutes);
  app.use("/api/mythic", mythicRoutes);
  app.use("/api/ctf", ctfRoutes);
  app.use("/api/workspace", workspaceRoutes);
  app.use("/api/mcp", mcpRoutes);
  app.use("/mcp", mcpHttpRoutes);
  app.use("/api/billing", billingRoutes);
  app.use("/api/payment", paymentRoutes);
  app.use("/api/plans", planRoutes);
  app.use("/api/subscriptions", subscriptionRoutes);
  app.use("/api/telegram", telegramBotRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/announcements", announcementRoutes);
  app.use("/api/blog", blogRoutes);
  app.use("/api/menus", menuRoutes);
  app.use("/api/oob", oobRoutes);
  app.use("/api/public", publicRoutes);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use(function (err: any, _req: any, res: any, _next: any) {
    logger.error("unhandled request error", {
      method: _req?.method,
      path: _req?.originalUrl,
      err,
    });

    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "File size limit exceeded" });
      }
      if (err.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({ message: "Unexpected File type or Number of File(s)" });
      }
      return res.status(400).json({ message: "Error occurred uploading file" });
    }
    return res.status(400).json({
      message: "Something went wrong, please try again later",
    });
  });

  return { app, sessionMiddleware };
}
