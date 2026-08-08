import express from "express";
import os from "os";
import cors from "cors";
import cookieParser from "cookie-parser";
import session from "express-session";
import { createClient, RedisClientType } from "redis";
import mongoose from "mongoose";
import { createServer } from "http";
const mongoSanitize = require("express-mongo-sanitize");
import multer from "multer";
import RedisStore from "connect-redis";
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




import { ensureDefaultGateways } from "./services/payment.service";
import { ensureDefaultPlans } from "./services/plan.service";
import getSecrets from "./utils/getSecrets";
import { setBotToken, startTelegramBot } from "./services/telegramBot.service";
import bcrypt from "bcrypt";
import UserModel from "./models/User/User.model";




import { initTracing } from "./utils/tracing";
import { setupShellWebSocket } from "./services/shell.socket";
import { sessionLifecycle } from "./services/session.lifecycle";
import { apiRateLimiter } from "./middlewares/RateLimit.middleware";
import crypto from "crypto";

// Fail fast on DB operations instead of buffering queries for 10s then timing out.
// This makes connection failures surface immediately rather than as confusing
// "buffering timed out after 10000ms" errors on every request.
mongoose.set("bufferCommands", false);

declare module "express-session" {
  export interface SessionData {
    user: { userId: string };
    environment: string;
  }
}

let redisClient: RedisClientType;

const initializeApp = async () => {
  try {
    initTracing();

    const DEPLOYMENT = await getSecrets("DEPLOYMENT");
    const MONGO_URI = await getSecrets("MONGO_URI");
    const REDIS_URL = await getSecrets("REDIS_URL");
    redisClient = createClient({ url: REDIS_URL });

    // Enforce a strong session secret. If none is configured, generate a
    // random one at startup (sessions will be invalidated on restart, which
    // is safer than using a weak/default secret in production).
    let SESS_SECRET = await getSecrets("SESS_SECRET");
    if (!SESS_SECRET || SESS_SECRET.length < 32) {
      const generated = crypto.randomBytes(48).toString("hex");
      if (DEPLOYMENT === "LOCAL") {
        console.warn(
          "[security] SESS_SECRET is missing or too short. Generated a random secret for this session. " +
            "Set a strong SESS_SECRET (>= 32 chars) in config.toml or .env for persistent sessions.",
        );
        SESS_SECRET = generated;
      } else {
        // In production, refuse to start with a weak secret.
        throw new Error(
          "SESS_SECRET must be set to a strong value (>= 32 characters) in production.",
        );
      }
    }


    const connectToDB = async () => {
      if (!MONGO_URI) {
        throw new Error(
          "MONGO_URI not configured. Set mongo_uri in config.toml or MONGO_URI in the environment.",
        );
      }
      await mongoose.connect(MONGO_URI, {
        serverSelectionTimeoutMS: 15000,
      });
      console.log(
        `MongoDB connected: ${MONGO_URI.replace(/\/\/[^@]*@/, "//***@")}`,
      );
    };

    const app = express();
    const port = parseInt(process.env.PORT || "8080", 10);

    const defaultWhitelist = [
      "http://127.0.0.1:8080",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3001",
      "http://127.0.0.1:5000",
      "http://localhost:8080",
      "http://localhost:5000",
      "http://localhost:3001",
      "http://localhost:3000",
    ];

    const corsOriginsEnv = process.env.CORS_ORIGINS;
    const localWhitelist = corsOriginsEnv
      ? [
          ...defaultWhitelist,
          ...corsOriginsEnv.split(",").map((o) => o.trim()).filter(Boolean),
        ]
      : defaultWhitelist;

    const corsOptions = {
      origin: localWhitelist,
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

    app.use(cors(corsOptions));
    app.options("*", cors(corsOptions));

    app.use(
      express.urlencoded({
        extended: true,
      })
    );

    app.use((req, res, next) => {
      express.json({
        limit: "5mb",
        type: ["application/json", "text/plain"],
      })(req, res, (err) => {
        if (err) {
          console.log(err);
          return res.status(400).json({ message: "Invalid JSON" });
        } else {
          next();
        }
      });
    });

    app.use(cookieParser());
    app.use(mongoSanitize());

    // Global API rate limiting (applies to all /api routes)
    app.use("/api", apiRateLimiter);


    // @ts-ignore
    let redisStore = new RedisStore({ client: redisClient });

    const sessionConfig = {
      secret: SESS_SECRET as string,
      resave: false,
      name: "sid",
      saveUninitialized: false,
      proxy: true,
      store: redisStore,
      cookie: {
        sameSite: true as const,
        secure: DEPLOYMENT === "LOCAL" ? false : true,
        maxAge: 1000 * 60 * 60 * 12,
      },
    };

    const sessionMiddleware = session(sessionConfig);
    app.use(sessionMiddleware);

    const httpServer = createServer(app);

    // Connect to MongoDB and Redis BEFORE accepting any requests so that
    // Mongoose operations never buffer for 10s then time out. If these
    // connections fail, startup throws and initializeApp() retries in 5s.
    await connectToDB();
    await redisClient.connect();
    console.log(`Redis connected`);

    // WebSocket for shell streaming (replaces Socket.IO terminal handling)
    setupShellWebSocket(httpServer, sessionMiddleware);

    app.get("/", (_req, res) => {
      res.send("Hello World!");
    });

    app.get("/api/healthcheck", (_req, res) => {
      res.status(200).send("OK");
    });

    app.get("/api/test/google-search", async (_req, res) => {
      try {
        const apiKey = await getSecrets("GOOGLE-API-KEY");
        const cx = await getSecrets("CUSTOM-SEARCH-ENGINE-ID");

        if (!apiKey || !cx) {
          const missing = [!apiKey && "GOOGLE-API-KEY", !cx && "CUSTOM-SEARCH-ENGINE-ID"].filter(Boolean);
          console.error("[Google Search Test] Missing env vars:", missing.join(", "));
          return res.status(500).json({ success: false, error: `Missing configuration: ${missing.join(", ")}` });
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




    app.use(function (err: any, req: any, res: any, next: any) {

      console.log("Error occurred but handled - ", err);

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

    httpServer.listen(port, async () => {
      // Seed default payment gateway rows so the admin can configure them.
      try {
        await ensureDefaultGateways();
        console.log(`[payment] Default payment gateways ensured`);
      } catch (err) {
        console.warn("[payment] Failed to seed default gateways:", err);
      }

      // Seed default plans so the system works out of the box.
      try {
        await ensureDefaultPlans();
        console.log(`[plans] Default plans ensured`);
      } catch (err) {
        console.warn("[plans] Failed to seed default plans:", err);
      }

      // Ensure there is always at least one admin account so the admin panel
      // can be accessed. Credentials can be overridden via ADMIN_EMAIL /
      // ADMIN_PASSWORD env vars (defaults shown below). If the admin already
      // exists, its password is left untouched.
      try {
        const adminEmail = (await getSecrets("ADMIN_EMAIL")) || "admin@vektorsec.com";
        const adminPassword = (await getSecrets("ADMIN_PASSWORD")) || "admin1234";

        const existingAdmin = await UserModel.findOne({ role: "admin" });
        if (!existingAdmin) {
          const hashedPassword = await bcrypt.hash(adminPassword, 10);
          await UserModel.create({
            name: "Administrator",
            email: adminEmail,
            password: hashedPassword,
            role: "admin",
            plan: "enterprise",
            firstLogin: false,
          });
          console.log(`[auth] Default admin account ensured (${adminEmail})`);
        } else {
          console.log(`[auth] Admin account already exists (${existingAdmin.email})`);
        }
      } catch (err) {
        console.warn("[auth] Failed to seed admin account:", err);
      }

      // Reset any sessions stuck in "running" state from a previous crash/restart
      try {
        const { default: SessionsModel } = await import("./models/Sessions/Sessions.model");
        const result = await SessionsModel.updateMany(
          { agentState: "running" },
          { $set: { agentState: "idle" } },
        );
        if (result.modifiedCount > 0) {
          console.log(`[startup] Reset ${result.modifiedCount} session(s) from "running" to "idle"`);
        }
      } catch (err) {
        console.warn("[startup] Failed to reset stale agent sessions:", err);
      }

      // Start the Telegram bot if a token is configured.
      try {
        const telegramToken = await getSecrets("TELEGRAM_BOT_TOKEN");
        if (telegramToken) {
          setBotToken(telegramToken);
          startTelegramBot();
          console.log("[telegram] Telegram bot token configured, starting bot...");
        } else {
          console.log("[telegram] TELEGRAM_BOT_TOKEN not set. Telegram bot disabled. Configure via /api/telegram/configure.");
        }
      } catch (err) {
        console.warn("[telegram] Failed to start Telegram bot:", err);
      }

      console.log(`Express is listening at http://localhost:${port}`);

    });

    process.on("SIGTERM", async () => {
      console.log("SIGTERM received. Shutting down gracefully...");

      await sessionLifecycle.destroyAll();

      const memoryUsage = process.memoryUsage();
      console.log("Memory Usage:", {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
      });

      httpServer.close(() => {
        console.log("HTTP server closed.");
        process.exit(0);
      });
    });
  } catch (error) {
    console.log("Error initializing app", error);
    setTimeout(() => {
      initializeApp();
    }, 5000);
  }
};

initializeApp().catch((error) => {
  console.error("Failed to initialize server:", error);
});

export { redisClient };
