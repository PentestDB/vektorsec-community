"use strict";

/**
 * VektorSec desktop shell — Electron main process.
 *
 * Boots the backend natively (see `backend-runner.js`), opens the frontend, and
 * exposes a tiny, context-isolated IPC surface for the license UI (show HWID,
 * show license state, save a pasted license key).
 */

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

// Electron derives `app.getPath("userData")` from the package name
// ("vektorsec-desktop"). Pin it to the product name so `license.key`, the
// server logs and the Chromium caches all live in %APPDATA%\VektorSec exactly
// as the documentation describes.
app.setName("VektorSec");

// If ELECTRON_RUN_AS_NODE leaks into the environment (some CI shells and
// toolchains export it), Electron boots as plain Node and `require("electron")`
// returns the binary path instead of the API — the app would exit silently.
if (!app || typeof app.whenReady !== "function") {
  console.error(
    "[vektorsec] Electron is running as plain Node.js.\n" +
      "[vektorsec] Unset ELECTRON_RUN_AS_NODE and start the app again:\n" +
      "[vektorsec]   PowerShell:  Remove-Item Env:ELECTRON_RUN_AS_NODE\n" +
      "[vektorsec]   cmd.exe:     set ELECTRON_RUN_AS_NODE=",
  );
  process.exit(1);
}

const net = require("node:net");
const http = require("node:http");

const { startBackend, stopBackend, startFrontend, stopFrontend, readLicensePublicKey } = require("./backend-runner");
const { startLocalDb, stopLocalDb, MONGO_PORT, REDIS_PORT } = require("./local-db");
const {
  findBusyPorts,
  isPortBusy,
  isLocalDbOwned,
  buildConflictDialog,
  buildForeignDbDialog,
} = require("./port-guard");
const { getLicenseInfo } = require("./drm-ipc");

const FRONTEND_PORT = Number(process.env.FRONTEND_PORT || 3001);
const BACKEND_PORT = Number(process.env.PORT || 8081);
const FRONTEND_URL = process.env.VEKTORSEC_FRONTEND_URL || `http://127.0.0.1:${FRONTEND_PORT}`;
const BACKEND_URL = process.env.VEKTORSEC_BACKEND_URL || `http://127.0.0.1:${BACKEND_PORT}`;

let mainWindow = null;

/** Resolve once `host:port` accepts connections, or after `timeoutMs`. */
function waitForPort(host, port, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const attempt = () => {
      const socket = net.connect({ host, port });
      socket.setTimeout(1500);
      const retry = () => {
        socket.destroy();
        if (Date.now() > deadline) return resolve(false);
        setTimeout(attempt, 500);
      };
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("timeout", retry);
      socket.once("error", retry);
    };
    attempt();
  });
}

/**
 * Resolve once `url` answers with a 2xx status, or `false` after `timeoutMs`.
 *
 * A bound port is not the same thing as a usable service: the backend binds
 * only after it has connected to MongoDB/Redis, and the gateway answers 502
 * (`Gateway upstream error`) for as long as its `/api` upstream is not ready.
 * Readiness is an HTTP question, so ask it over HTTP instead of guessing from
 * the socket.
 */
function waitForHttpOk(url, timeoutMs = 60_000, intervalMs = 400) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        const ok = typeof res.statusCode === "number" && res.statusCode >= 200 && res.statusCode < 300;
        res.resume();
        req.destroy();
        if (ok) return resolve(true);
        retry();
      });
      req.setTimeout(2000, () => req.destroy());
      req.once("error", retry);
      function retry() {
        req.destroy();
        if (Date.now() > deadline) return resolve(false);
        setTimeout(attempt, intervalMs);
      }
    };
    attempt();
  });
}

function licenseKeyFile() {
  return path.join(app.getPath("userData"), "license.key");
}

function readLicenseKey() {
  try {
    return fs.readFileSync(licenseKeyFile(), "utf8").trim();
  } catch {
    return "";
  }
}

function writeLicenseKey(key) {
  fs.mkdirSync(path.dirname(licenseKeyFile()), { recursive: true });
  fs.writeFileSync(licenseKeyFile(), String(key || "").trim());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "VektorSec",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadURL(FRONTEND_URL);
}

function registerIpc() {
  ipcMain.handle("drm:hwid", async () => (await getLicenseInfo({})).hwid);
  ipcMain.handle("drm:state", async () =>
    getLicenseInfo({ licenseKey: readLicenseKey(), publicKey: readLicensePublicKey() }),
  );
  ipcMain.handle("drm:save-license", async (_event, key) => {
    writeLicenseKey(key);
    return getLicenseInfo({ licenseKey: readLicenseKey(), publicKey: readLicensePublicKey() });
  });
}

/**
 * Persist boot problems next to the child-process logs: a packaged Windows GUI
 * app has no console, so a failed start would otherwise leave no trace behind.
 */
function logStartupProblem(message) {
  console.error(message);
  try {
    const dir = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "startup.log"), `${new Date().toISOString()} ${message}\n`);
  } catch {
    /* logging must never break the boot */
  }
}

/** Refuse to start, with an explanation, instead of opening another app's UI. */
function abortWithDialog(content) {
  logStartupProblem(`${content.title} - ${content.message}`);
  try {
    dialog.showErrorBox(content.title, `${content.message}\n\n${content.detail}`);
  } catch {
    /* no display available */
  }
  app.quit();
}

async function boot() {
  // Dialogs and app.getPath() require a ready Electron app.
  await app.whenReady();

  // ── Port guard ──────────────────────────────────────────────────────────
  // The desktop app and both compose files publish the same ports (3001, 8081,
  // 27017, 6379). With the Docker stack up, our gateway dies with EADDRINUSE
  // and the window would show the *Docker* UI backed by the *Docker* database —
  // the login then fails with a 401 that looks like a wrong password. Fail
  // loudly instead of guessing.
  const busyServicePorts = await findBusyPorts([FRONTEND_PORT, BACKEND_PORT]);
  if (busyServicePorts.length > 0) {
    abortWithDialog(
      buildConflictDialog({
        busyPorts: busyServicePorts,
        frontendPort: FRONTEND_PORT,
        backendPort: BACKEND_PORT,
      }),
    );
    return;
  }

  const userDataDir = app.getPath("userData");

  // 27017/6379 may legitimately be reused (scripts/local-db.ps1 started them and
  // wrote a pid file). Anything else on those ports means the app is about to
  // write into somebody else's database - ask before doing that.
  const foreignMongo = (await isPortBusy(MONGO_PORT)) && !isLocalDbOwned({ userDataDir, name: "mongod" });
  const foreignRedis = (await isPortBusy(REDIS_PORT)) && !isLocalDbOwned({ userDataDir, name: "redis" });
  if (foreignMongo || foreignRedis) {
    const content = buildForeignDbDialog({
      mongo: foreignMongo,
      redis: foreignRedis,
      ports: { mongo: MONGO_PORT, redis: REDIS_PORT },
    });
    logStartupProblem(`${content.title} - ${content.message}`);
    const choice = dialog.showMessageBoxSync({
      type: "warning",
      title: content.title,
      message: content.message,
      detail: content.detail,
      buttons: ["Continue", "Quit"],
      defaultId: 1,
      cancelId: 1,
    });
    if (choice !== 0) {
      app.quit();
      return;
    }
  }

  // MongoDB + Redis: start the portable local runtime when it is installed and
  // nothing is listening yet. Without them the backend exits in a restart loop
  // and the UI shows "Gateway upstream error" on the login page.
  const db = await startLocalDb({
    userDataDir: app.getPath("userData"),
    note: (message) => console.error(message),
  });
  if (!db.mongo || !db.redis) {
    console.error(
      `[vektorsec] local database not ready (mongodb=${db.mongo}, redis=${db.redis}) — ` +
        "run:  powershell -ExecutionPolicy Bypass -File scripts\\local-db.ps1 install",
    );
  }

  startBackend();
  startFrontend({ port: FRONTEND_PORT });
  registerIpc();

  // The gateway serves /api by proxying to the backend, so booting the window
  // before :8081 answers makes the very first request fail with "Gateway
  // upstream error". Wait for both: the backend is the slower one on a cold
  // start (mongod/redis handshake + first admin seeding).
  const [backendPortOpen, gatewayReady] = await Promise.all([
    waitForPort("127.0.0.1", BACKEND_PORT),
    waitForHttpOk(`${FRONTEND_URL}/`, 75_000),
  ]);

  // A bound port is not readiness: /api/ready also proves MongoDB + Redis are
  // reachable, which is what the first login request needs.
  const backendReady = backendPortOpen && (await waitForHttpOk(`${BACKEND_URL}/api/ready`, 45_000));

  if (!backendPortOpen) {
    console.error(
      `[vektorsec] backend did not start on port ${BACKEND_PORT} - see logs\\backend.log. ` +
        "If it says 'Secret MONGO_URI not found', the local database is missing: " +
        "powershell -ExecutionPolicy Bypass -File scripts\\local-db.ps1 install",
    );
  } else if (!backendReady) {
    console.error(
      `[vektorsec] backend is listening on :${BACKEND_PORT} but /api/ready is not OK ` +
        "(MongoDB/Redis unreachable) - see the backend log in the app data folder",
    );
  }
  if (!gatewayReady) {
    console.error(`[vektorsec] gateway did not answer on ${FRONTEND_URL} - see the frontend log`);
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

// A second copy would fight the first one for 3001/8081/27017 — keep one stack
// per machine and just bring the existing window forward.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  boot().catch((error) => {
    abortWithDialog({
      title: "VektorSec failed to start",
      message: error && error.message ? error.message : String(error),
      detail:
        "See backend.log / frontend.log / startup.log in the app data folder " +
        "(%APPDATA%\\VektorSec\\logs).",
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopBackend();
  stopFrontend();
  stopLocalDb();
});
