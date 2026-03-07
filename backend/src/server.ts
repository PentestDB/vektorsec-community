/* eslint-disable @typescript-eslint/no-var-requires */
import express from "express";
// import cors
import os from "os";
import cors from "cors";

// import cookie-parser
import cookieParser from "cookie-parser";
import session from "express-session";
import socketSession from "express-socket.io-session";

import { authRoutes } from "./routes/auth.routes";

import { createClient, RedisClientType } from "redis";
import mongoose from "mongoose";

import { Server } from "socket.io";
import { createServer } from "http";
// import mongoSanitize
const mongoSanitize = require("express-mongo-sanitize");
import fs from "fs";
import multer from "multer";
import RedisStore from "connect-redis";
import { taskRoutes } from "./routes/task.routes";
import UserModel from "./models/User/User.model";
import { copilotRoutes } from "./routes/copilot.routes";
import getSecrets from "./utils/getSecrets";
import { buildSSHConfig } from "./utils/sshConfig";
import { sessionRoutes } from "./routes/session.routes";
import { trackExecCommandOutput } from "./services/session.services";
import { userRoutes } from "./routes/user.routes";
import { Client as SSHClient } from "ssh2";

declare module "express-session" {
  export interface SessionData {
    user: { userId: string };
    environment: string;
  }
}

let redisClient: RedisClientType;

const initializeApp = async () => {
  try {
    const DEPLOYMENT = await getSecrets("DEPLOYMENT");
    const MONGO_URI = await getSecrets("MONGO_URI");

    const REDIS_URL = await getSecrets("REDIS_URL");
    redisClient = createClient({ url: REDIS_URL });

    const SESS_NAME = await getSecrets("SESS_NAME");
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
    const port = 8080;

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
      name: SESS_NAME as string,
      saveUninitialized: false,
      proxy: true,
      store: redisStore,
      cookie: {
        sameSite: true,
        secure: DEPLOYMENT === "LOCAL" ? false : true,
        maxAge: 1000 * 60 * 60 * 12,
      },
    };

    app.use(session(sessionConfig));

    const httpServer = createServer(app);


    const sshConfig = buildSSHConfig();


    // backend-frontend socket
    const socketServer = new Server(httpServer, {
      cors: {
        origin: localWhitelist,
        credentials: true,
        methods: ["GET", "POST"],
      },
    });

    socketServer.on("connection", (socket) => {
      console.log("Connected to socket server");
    });

    socketServer.use(socketSession(session(sessionConfig), { autoSave: true }) as any);

    // write a socketServer middleware to check if the user is authenticated
    socketServer.use(async (socket, next) => {
      try {
        const socketHandshake: any = socket.handshake;
        const userId = socketHandshake?.session?.user.userId;

        if (!userId) {
          return next(new Error("Unauthorized"));
        }

        const user = await UserModel.findById(userId);

        if (!user) {
          return next(new Error("Unauthorized"));
        }

        (socket as any).userId = user._id;

        return next();
      } catch (err) {
        return next(new Error("Unauthorized"));
      }
    });

    // (Frontend - Backend Socket Connection) used to connect to exploit box - opens the socket for frontend to connect on
    socketServer.on("connection", async (frontendSocket) => {
      try {
        console.log("Connected to socket server");

        const userId = (frontendSocket as any).userId;

        if (!userId) {
          return;
        }

        const user = await UserModel.findById(userId);

        if (!user) {
          return;
        }

        let runnningCommand = false;
        let currentCommand = "";
        let terminalOutput: string[] = [];

        const terminalId = frontendSocket.handshake.query.terminalId as string;

        if (!terminalId) {
          console.log("Terminal ID not provided");
          return;
        }

        console.log("Terminal ID", terminalId);
        const conn = new SSHClient();
        conn
          .on("ready", () => {
            console.log("SSH connection ready");
            frontendSocket.emit(`ssh-ready-${terminalId}`, {});
            conn.shell((err, stream) => {
              if (err) {
                console.error(err);
                return;
              }
              stream.on("data", async (data: any) => {
                const message = data.toString();
                console.log("SSH shell data:", message);
                socketServer.emit(`terminal-data-${terminalId}`, message);
                if (runnningCommand) {
                  console.log("🔄 Processing command output...");
                  const ansiRegex = /\x1B\[[0-?]*[-\[\]#-~]/g;
                  terminalOutput.push(data.toString());
                  const stringTerminalOutput = terminalOutput
                    .join("")
                    .replace(ansiRegex, "")
                  console.log("📝 Accumulated output length:", stringTerminalOutput.length);

                  const regex = /<command_id_start>([\w-]+)<\/command_id_start>/;
                  const [_, commandId] =
                    stringTerminalOutput.match(regex) || [];
                  console.log("🔍 Current output preview:", stringTerminalOutput.substring(0, 200));
                  if (!commandId) {
                    console.log("❌ Command ID not found in output");
                  } else {
                    console.log("✅ Command ID found:", commandId);
                    console.log("🔍 Checking if command is completed...");
                    const execStatus = await trackExecCommandOutput(stringTerminalOutput, currentCommand);
                    console.log("📊 Exec status:", execStatus?.status);
                    if (execStatus && execStatus.status === "completed") {
                      runnningCommand = false;
                      if (frontendSocket.connected) {
                        console.log(`Emitting command_executed-${terminalId}`)
                        console.log("🔍 Command output:", execStatus.output);
                        frontendSocket.emit(`command_executed-${terminalId}`, {
                          status: "success",
                          message: "Command Executed",
                          plugin_response: execStatus.output,
                          commandId: commandId,
                          type: "output",
                        });
                        console.log("✅ Command result emitted successfully");
                      } else {
                        console.log("❌ Frontend socket disconnected");
                      }
                      terminalOutput = [];
                      console.log("🧹 Terminal output buffer cleared");
                    } else {
                      console.log("⏳ Command still running...");
                    }
                  }
                }
              });
              stream.on("close", () => {
                console.log("SSH shell closed");
                frontendSocket.disconnect();
                conn.end();
              });

              frontendSocket.on(`terminal-input-${terminalId}`, (data) => {
                console.log("Terminal input", data);
                const input = data.toString();
                if (!input.includes(":bugbase:::")) {
                  console.log("📤 Regular input:", input);
                  stream.write(input);
                } else {
                  console.log("🚀 Special command detected:", input);
                  const [type, command] = input.split(":bugbase:::");
                  if (type === "run_command") {
                    console.log("🎯 Starting new command execution...");
                    runnningCommand = true;
                    currentCommand = command;
                    terminalOutput = [];
                    console.log("📋 Command to run:", command);
                    console.log("🔄 Command execution started");
                  }
                  stream.write(
                    command.replace(/:bugbase:::/g, "").trim() + "\n"
                  );
                  console.log("📤 Command sent to SSH stream");
                }
              });
              frontendSocket.on("disconnect", () => {
                console.log("Frontend socket disconnected");
                stream.end();
                conn.end();
              });
            });
          })
          .on("error", (err) => {
            console.error("SSH connection error:", err);
          })
          .connect(sshConfig);
      } catch (err) {
        console.log("Error connecting to socket");
        console.log(err);
      }
    });

    socketServer.on("disconnect", () => {
      console.log("Disconnected from socket server");

      socketServer.close();
    });

    app.get("/", (req, res) => {
      res.send("Hello World!");
    });

    app.get("/api/healthcheck", (req, res) => {
      res.status(200).send("OK");
    });

    // Auth routes
    app.use("/api/auth", authRoutes);


    // Task routes
    app.use("/api/task", taskRoutes);

    // Task routes
    app.use("/api/copilot", copilotRoutes);

    // User routes
    app.use("/api/user", userRoutes);

    // Session routes
    app.use("/api/session", sessionRoutes);


    // Add a generalized error handling middleware function for all other errors
    app.use(function (err: any, req: any, res: any, next: any) {
      console.log("Error occurred but handled - ", err);
      console.log("Error occurred but handled - ", err?.code);

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ message: "File size limit exceeded" });
        }

        if (err.code === "LIMIT_UNEXPECTED_FILE") {
          return res
            .status(400)
            .json({ message: "Unexpected File type or Number of File(s)" });
        }

        return res
          .status(400)
          .json({ message: "Error occurred uploading file" });
      }
      return res.status(400).json({
        message: "Something went wrong, please try again later",
      });
    });

    const retryInterval = 60 * 1000; // Time interval between retries in milliseconds

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
      console.log(`Express is listening at http://localhost:${port}`);
    });

    // Handle SIGTERM for graceful shutdown
    process.on("SIGTERM", () => {
      console.log("SIGTERM received. Shutting down gracefully...");

      // Log current memory usage
      const memoryUsage = process.memoryUsage();
      console.log("Memory Usage:", {
        rss: memoryUsage.rss, // Resident Set Size
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
      });

      // Log current CPU usage
      const cpuUsage = process.cpuUsage();
      console.log("CPU Usage:", cpuUsage);

      // Log system information
      console.log("System Information:", {
        freeMemory: os.freemem(),
        totalMemory: os.totalmem(),
        loadAvg: os.loadavg(),
        uptime: os.uptime(),
      });

      // Log open connections (example for an Express server)
      httpServer.getConnections((err, count) => {
        if (err) {
          console.error("Error retrieving open connections:", err);
        } else {
          console.log(`Open connections: ${count}`);
        }
      });

      // Close HTTP server gracefully
      httpServer.close(() => {
        console.log("HTTP server closed.");

        // Perform additional cleanup, like closing database connections
        // mongoose.connection.close(...)

        process.exit(0); // Exit the process once everything is cleaned up
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
