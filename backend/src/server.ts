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
import { ctfRoutes } from "./routes/ctf.routes";
import { workspaceRoutes } from "./routes/workspace.routes";
import { mcpRoutes } from "./routes/mcp.routes";
import { mcpHttpRoutes } from "./routes/mcp-http.routes";
import getSecrets from "./utils/getSecrets";
import { initTracing } from "./utils/tracing";
import { setupShellWebSocket } from "./services/shell.socket";
import { sessionLifecycle } from "./services/session.lifecycle";

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

    const SESS_SECRET = await getSecrets("SESS_SECRET");

    const connectToDB = async () => {
      try {
        if (!MONGO_URI) {
          console.log("URI not provided!");
          return;
        }
        await mongoose.connect(MONGO_URI);
      } catch (err) {
        console.log(err);
      }
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
    app.use("/api/ctf", ctfRoutes);
    app.use("/api/workspace", workspaceRoutes);
    app.use("/api/mcp", mcpRoutes);
    app.use("/mcp", mcpHttpRoutes);

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
      try {
        await connectToDB();
        console.log(`MongoDB connected`);
      } catch (err) {
        console.log(err);
      }

      try {
        await redisClient.connect();
        console.log(`Redis connected`);
      } catch (err) {
        console.log(err);
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
