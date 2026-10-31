"use strict";

/**
 * Startup guard for the desktop shell — stop the app from silently sharing a
 * port with another local stack.
 *
 * Why this exists: the desktop app, `docker-compose.dev.yml` and
 * `docker-compose.yml` all publish the SAME ports (3001 gateway, 8081 backend,
 * 27017 MongoDB, 6379 Redis). When the Docker stack is already running:
 *
 *   - the gateway child dies with `EADDRINUSE 127.0.0.1:3001`, and
 *   - the backend happily connects to the *Docker* MongoDB on 27017, so the
 *     window then shows the Docker UI and the login fails with 401
 *     "Invalid credentials" (wrong admin hash, right-looking screen).
 *
 * A bound port is therefore an error condition, not something to wait on: the
 * caller aborts with an explanation instead of opening the wrong application.
 */

const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

/** Resolve true when `port` cannot be bound on `host` (something already listens). */
function isPortBusy(port, host = "127.0.0.1", timeoutMs = 1500) {
  return new Promise((resolve) => {
    const server = net.createServer();
    let settled = false;

    const finish = (busy) => {
      if (settled) return;
      settled = true;
      try {
        server.close();
      } catch {
        /* never listened */
      }
      resolve(busy);
    };

    server.once("error", (error) => {
      // EADDRINUSE = taken; EACCES = privileged/reserved port, also unusable.
      finish(error.code === "EADDRINUSE" || error.code === "EACCES");
    });
    server.once("listening", () => finish(false));
    server.listen({ port, host, exclusive: true });

    const timer = setTimeout(() => finish(true), timeoutMs);
    if (typeof timer.unref === "function") timer.unref();
  });
}

/** Resolve the subset of `ports` that is already taken. */
async function findBusyPorts(ports, host = "127.0.0.1") {
  const checks = await Promise.all(
    ports.map(async (port) => ({ port, busy: await isPortBusy(port, host) })),
  );
  return checks.filter((check) => check.busy).map((check) => check.port);
}

/**
 * Read a pid file written by `scripts/local-db.ps1`
 * (`%APPDATA%\VektorSec\runtime\mongod.pid` / `redis.pid`).
 * Returns null when the file is missing or malformed.
 */
function readPid(file) {
  try {
    const value = Number(fs.readFileSync(file, "utf8").trim());
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Was the server on `port` started by this app (or by scripts/local-db.ps1)?
 * `false` means "somebody else owns the database" — typically the Docker stack,
 * which would make the app read a different MongoDB than its own.
 */
function isLocalDbOwned({ userDataDir, name }) {
  const pidFile = path.join(userDataDir, "runtime", `${name}.pid`);
  return isPidAlive(readPid(pidFile));
}

const DOCKER_HINT =
  "Another VektorSec stack is probably running in Docker (it publishes the same " +
  "ports). Stop it first:\n\n" +
  "    scripts\\docker-stack.ps1 down      (or: docker compose -f docker-compose.dev.yml down)\n\n" +
  "or switch modes with:  scripts\\app-stack.ps1 up";

/** Dialog content for a startup port conflict. */
function buildConflictDialog({ busyPorts, frontendPort, backendPort }) {
  const list = busyPorts.join(", ");
  return {
    title: "VektorSec cannot start — port already in use",
    message: `Port ${list} is already in use, so the desktop app cannot serve its own UI.`,
    detail:
      `The gateway needs ${frontendPort} and the backend needs ${backendPort}.\n\n` +
      `${DOCKER_HINT}\n\n` +
      "ถ้าต้องการปิด Docker stack ก่อนแล้วเปิดแอปใหม่ ให้รัน: scripts\\app-stack.ps1 up\n" +
      "(ที่อยู่เดิมยังทำงานอยู่ — ปิดหน้าต่างแอปเก่าหรือ stack ที่ชนพอร์ตก่อน)",
  };
}

/** Dialog content for "the database on 27017/6379 is not ours". */
function buildForeignDbDialog({ mongo, redis, ports }) {
  const names = [mongo ? `MongoDB (${ports.mongo})` : null, redis ? `Redis (${ports.redis})` : null]
    .filter(Boolean)
    .join(" + ");
  return {
    title: "VektorSec — another database is already running",
    message: `${names} is already listening but was not started by VektorSec.`,
    detail:
      "The app would store its data in THAT database, so an admin password you set for " +
      "the desktop app will not work (this shows up as HTTP 401 on the login page).\n\n" +
      `${DOCKER_HINT}\n\n` +
      "เลือก Continue เฉพาะเมื่อคุณตั้งใจให้แอปใช้ MongoDB/Redis ตัวนั้นจริง ๆ",
  };
}

module.exports = {
  isPortBusy,
  findBusyPorts,
  readPid,
  isPidAlive,
  isLocalDbOwned,
  buildConflictDialog,
  buildForeignDbDialog,
};
