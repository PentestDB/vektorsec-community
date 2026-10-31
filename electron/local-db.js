"use strict";

/**
 * Optional MongoDB + Redis runtime for the standalone desktop app.
 *
 * The backend needs MongoDB (`MONGO_URI`) and Redis (`REDIS_URL`). Requiring a
 * Docker Desktop install just to run them defeats the point of the desktop
 * build, so this module starts *portable* servers that live next to the user's
 * data:
 *
 *   %APPDATA%\VektorSec\runtime\mongodb\bin\mongod.exe
 *   %APPDATA%\VektorSec\runtime\redis\redis-server.exe
 *   %APPDATA%\VektorSec\data\mongo   (dbpath)
 *   %APPDATA%\VektorSec\data\redis   (rdb dir)
 *
 * `scripts/local-db.ps1` downloads/extracts those binaries (once) and can also
 * start/stop them by hand. This module is what makes the app self-starting:
 * without it a reboot leaves the UI alive but every API call fails with
 * "Gateway upstream error" because nothing listens on 27017 / 6379.
 *
 * Starting is skipped when the port is already open (the user runs their own
 * MongoDB/Redis, or `startLocalDb` already ran), when the binaries are absent,
 * or when `VEKTORSEC_LOCAL_DB=0`.
 */

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const MONGO_PORT = Number(process.env.MONGO_PORT || 27017);
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);

let mongodProcess = null;
let redisProcess = null;

function runtimeDir(userDataDir) {
  return path.join(userDataDir, "runtime");
}

function localDataDir(userDataDir) {
  return path.join(userDataDir, "data");
}

function mongodBinary(userDataDir) {
  return process.env.VEKTORSEC_MONGOD || path.join(runtimeDir(userDataDir), "mongodb", "bin", "mongod.exe");
}

function redisBinary(userDataDir) {
  return process.env.VEKTORSEC_REDIS_SERVER || path.join(runtimeDir(userDataDir), "redis", "redis-server.exe");
}

/** Resolve true when `host:port` accepts a TCP connection. */
function isPortOpen(host, port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function waitForPort(host, port, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(host, port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

function startMongod(userDataDir, note) {
  const binary = mongodBinary(userDataDir);
  if (!fs.existsSync(binary)) return null;

  const dbPath = path.join(localDataDir(userDataDir), "mongo");
  const logPath = path.join(userDataDir, "logs", "mongod.log");
  ensureDir(dbPath);
  ensureDir(path.dirname(logPath));

  const child = spawn(
    binary,
    [
      "--dbpath",
      dbPath,
      "--port",
      String(MONGO_PORT),
      "--bind_ip",
      "127.0.0.1",
      "--logpath",
      logPath,
      "--logappend",
    ],
    { stdio: "ignore", windowsHide: true },
  );
  child.on("error", (err) => note(`[vektorsec] mongod failed to start: ${err.message}`));
  return child;
}

function startRedis(userDataDir, note) {
  const binary = redisBinary(userDataDir);
  if (!fs.existsSync(binary)) return null;

  const dir = path.join(localDataDir(userDataDir), "redis");
  const logFile = path.join(userDataDir, "logs", "redis.log");
  ensureDir(dir);
  ensureDir(path.dirname(logFile));

  const child = spawn(
    binary,
    [
      "--port",
      String(REDIS_PORT),
      "--bind",
      "127.0.0.1",
      "--dir",
      dir,
      "--logfile",
      logFile,
      "--appendonly",
      "no",
    ],
    { stdio: "ignore", windowsHide: true },
  );
  child.on("error", (err) => note(`[vektorsec] redis-server failed to start: ${err.message}`));
  return child;
}

/**
 * Make sure both local servers are reachable, starting them when needed.
 * Resolves with `{ mongo, redis }` booleans describing the final state.
 */
async function startLocalDb(options = {}) {
  const state = {
    mongo: await isPortOpen("127.0.0.1", MONGO_PORT),
    redis: await isPortOpen("127.0.0.1", REDIS_PORT),
  };
  if (process.env.VEKTORSEC_LOCAL_DB === "0") return state;

  const note = options.note || ((message) => console.error(message));

  if (!state.mongo && !mongodProcess) {
    mongodProcess = startMongod(options.userDataDir, note);
    if (!mongodProcess) {
      note(
        "[vektorsec] mongod not found in %APPDATA%\\VektorSec\\runtime\\mongodb — run: powershell -File scripts\\local-db.ps1 install",
      );
    }
  }
  if (!state.redis && !redisProcess) {
    redisProcess = startRedis(options.userDataDir, note);
    if (!redisProcess) {
      note(
        "[vektorsec] redis-server not found in %APPDATA%\\VektorSec\\runtime\\redis — run: powershell -File scripts\\local-db.ps1 install",
      );
    }
  }

  state.mongo = state.mongo || (await waitForPort("127.0.0.1", MONGO_PORT));
  state.redis = state.redis || (await waitForPort("127.0.0.1", REDIS_PORT));
  return state;
}

function stopLocalDb() {
  for (const child of [mongodProcess, redisProcess]) {
    if (!child) continue;
    try {
      child.kill();
    } catch {
      /* already gone */
    }
  }
  mongodProcess = null;
  redisProcess = null;
}

module.exports = { startLocalDb, stopLocalDb, isPortOpen, MONGO_PORT, REDIS_PORT };
