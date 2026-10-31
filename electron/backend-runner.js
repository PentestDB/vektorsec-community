"use strict";

/**
 * Runs the VektorSec backend as a native child process inside Electron.
 *
 * Electron's `process.execPath` IS Node.js. Setting `ELECTRON_RUN_AS_NODE=1`
 * makes it behave exactly like a standalone `node` binary, so the same backend
 * build that normally runs in Docker boots natively on the host OS — no Docker
 * Desktop, no external Node install, and no separate service to manage.
 *
 * The DRM environment is assembled here before spawn:
 *   - `VEKTORSEC_LICENSE_KEY`     → the user's HWID-bound license key.
 *   - `VEKTORSEC_LICENSE_PUBLIC_KEY` → the vendor's Ed25519 public key.
 */

const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

let backendProcess = null;
let frontendProcess = null;
let backendLogStream = null;
let frontendLogStream = null;

/**
 * Root that contains `backend/` and `frontend/`.
 *
 * - development  → the repo root (one level above `electron/`)
 * - packaged app → `<resources>/`, because both servers are shipped through
 *   `extraResources` (not inside `app.asar`). A child process spawned via
 *   `ELECTRON_RUN_AS_NODE` cannot resolve `node_modules` from inside an asar.
 */
function serversRoot() {
  const candidates = [];
  if (process.resourcesPath) candidates.push(process.resourcesPath);
  candidates.push(path.join(__dirname, ".."));
  for (const root of candidates) {
    if (fs.existsSync(path.join(root, "backend", "dist", "server.js"))) return root;
  }
  return candidates[candidates.length - 1];
}

function backendEntry() {
  if (process.env.VEKTORSEC_BACKEND_ENTRY) return process.env.VEKTORSEC_BACKEND_ENTRY;
  return path.join(serversRoot(), "backend", "dist", "server.js");
}

/** The Next.js gateway (BFF) that serves the UI and proxies /api to the backend. */
function frontendEntry() {
  if (process.env.VEKTORSEC_FRONTEND_ENTRY) return process.env.VEKTORSEC_FRONTEND_ENTRY;
  return path.join(serversRoot(), "frontend", "server.js");
}

/** The user-editable license key lives under Electron's per-app userData dir. */
function licenseKeyFile(userDataDir) {
  return path.join(userDataDir, "license.key");
}

function readLicenseKey(userDataDir) {
  try {
    return fs.readFileSync(licenseKeyFile(userDataDir), "utf8").trim();
  } catch {
    return "";
  }
}

function readLicensePublicKey() {
  if (process.env.VEKTORSEC_LICENSE_PUBLIC_KEY) return process.env.VEKTORSEC_LICENSE_PUBLIC_KEY;
  const candidates = [
    path.join(__dirname, "license-public-key.pem"),
    path.join(process.resourcesPath || "", "license-public-key.pem"),
  ];
  for (const file of candidates) {
    try {
      const value = fs.readFileSync(file, "utf8").trim();
      if (value) return value;
    } catch {
      /* keep looking */
    }
  }
  return "";
}

function resolveUserDataDir() {
  try {
    // In the main process `app` is available; in a plain node context it isn't.
    // eslint-disable-next-line global-require
    return require("electron").app.getPath("userData");
  } catch {
    return process.env.VEKTORSEC_USER_DATA_DIR || path.join(process.cwd(), ".vektorsec-data");
  }
}

/**
 * Directory that holds the captured stdout/stderr of the two child servers.
 *
 * A packaged Windows GUI app has no console, so `stdio: "inherit"` silently
 * discards everything the backend prints — including the one-time
 * `[auth] … Temporary password: …` line that seeds the first admin account.
 * Writing the output to a file keeps that credential (and every startup error)
 * recoverable instead of lost.
 */
function logDir(userDataDir) {
  const dir = path.join(userDataDir, "logs");
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* fall back to a null stream */
  }
  return dir;
}

function logFileFor(userDataDir, name) {
  return path.join(logDir(userDataDir), `${name}.log`);
}

function openLogStream(userDataDir, name) {
  try {
    const stream = fs.createWriteStream(logFileFor(userDataDir, name), { flags: "a" });
    stream.write(`\n===== ${new Date().toISOString()} starting ${name} =====\n`);
    return stream;
  } catch {
    return null;
  }
}

/**
 * Directory that holds the mutable runtime data: `config.toml`, `.env`,
 * SSH/VPN profiles, session attachments. It is handed to the backend as
 * `DATA_DIR` (see `backend/src/utils/loadConfig.ts`).
 *
 * Writing next to the app's userData — instead of inside the install dir —
 * means the files stay writable and editable on a per-user install under
 * `C:\Program Files`, and survive upgrades.
 */
function dataDir(userDataDir) {
  const dir = path.join(userDataDir, "data");
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* the backend then falls back to its own resources directory */
  }
  return dir;
}

/** Minimal config.toml used when the packaged template cannot be read. */
const FALLBACK_CONFIG = `[server]
port = 8081
deployment = "LOCAL"
base_url_frontend = "http://localhost:3001"
cors_origins = "http://localhost:3001"

[database]
mongo_uri = "__MONGO_URI__"
mongo_database = "vektorsec"
redis_url = "__REDIS_URL__"

[admin]
email = "admin@vektorsec.local"
password = ""

[session]
secret = "__SESS_SECRET__"
lifetime = 1000

[tracing]
enabled = false
public_key = ""
secret_key = ""
base_url = "https://cloud.langfuse.com"
`;

/**
 * Seed `<userData>/data/config.toml` on the first run.
 *
 * The backend reads MONGO_URI / REDIS_URL / SESS_SECRET / DEPLOYMENT from
 * `$DATA_DIR/config.toml`. Without the file it starts with none of them and
 * dies in a 5-second restart loop, which the browser shows as
 * "Gateway upstream error" on the login page.
 *
 * Values are localised to 127.0.0.1 (the desktop app talks to MongoDB/Redis
 * running on this machine, not to Docker service names) and the session secret
 * is generated per install — never a shared constant.
 */
/** Desktop defaults: the app talks to MongoDB/Redis on this machine, never to
 *  the `mongodb` / `redis` service names used by config.example.toml (Docker). */
const LOCAL_MONGO_URI = "mongodb://127.0.0.1:27017/vektorsec";
const LOCAL_REDIS_URL = "redis://127.0.0.1:6379";
/** Values that only resolve inside `docker compose`. */
const CONTAINER_HOST = /(mongodb|redis):\d+/i;

/** Read a scalar (`key = value` / `key = "value"`) out of a TOML text. */
function tomlValue(text, key) {
  const match = text.match(new RegExp(`^[ \\t]*${key}[ \\t]*=[ \\t]*([^\\r\\n#]*)`, "m"));
  if (!match) return "";
  return match[1].trim().replace(/^"|"$/g, "");
}

/**
 * Set `key` inside `[section]`, replacing the current line when the key already
 * exists and inserting it right after the section header otherwise. Hand-rolled
 * on purpose: the Electron main process has no TOML dependency at runtime.
 */
function upsertTomlSetting(text, section, key, rhs) {
  const line = `${key} = ${rhs}`;
  const keyPattern = new RegExp(`^[ \\t]*${key}[ \\t]*=[^\\r\\n]*$`, "m");
  if (keyPattern.test(text)) return text.replace(keyPattern, () => line);

  const header = `[${section}]`;
  const at = text.indexOf(header);
  if (at === -1) {
    const sep = text.length && !text.endsWith("\n") ? "\n" : "";
    return `${text}${sep}\n${header}\n${line}\n`;
  }
  const eol = text.indexOf("\n", at + header.length);
  if (eol === -1) return `${text}\n${line}\n`;
  return `${text.slice(0, eol + 1)}${line}\n${text.slice(eol + 1)}`;
}

/**
 * Guarantee the four settings the backend refuses to boot without
 * (`backend/src/utils/loadConfig.ts`): DEPLOYMENT, MONGO_URI, REDIS_URL and a
 * strong SESS_SECRET. Missing any of them makes the backend exit in a 5-second
 * restart loop, so nothing listens on :8081 and the login page answers with
 * "Gateway upstream error" even though the UI (on :3001) is running fine.
 *
 * `seed` means the file is being created from the template, so the Docker host
 * names in it are rewritten unconditionally. Otherwise only empty, placeholder
 * or container-local values are patched -- a hand-edited remote URI is kept.
 */
function applyRequiredSettings(text, seed) {
  const changed = [];
  const set = (section, key, rhs) => {
    text = upsertTomlSetting(text, section, key, rhs);
    changed.push(key);
  };

  const deployment = tomlValue(text, "deployment");
  if (seed || !deployment) set("server", "deployment", '"LOCAL"');

  if (!tomlValue(text, "port")) set("server", "port", "8081");

  const mongoUri = tomlValue(text, "mongo_uri");
  if (seed || !mongoUri || /CHANGE_ME/i.test(mongoUri) || CONTAINER_HOST.test(mongoUri)) {
    if (mongoUri !== LOCAL_MONGO_URI) set("database", "mongo_uri", `"${LOCAL_MONGO_URI}"`);
  }

  if (!tomlValue(text, "mongo_database")) set("database", "mongo_database", '"vektorsec"');

  const redisUrl = tomlValue(text, "redis_url");
  if (seed || !redisUrl || /CHANGE_ME/i.test(redisUrl) || CONTAINER_HOST.test(redisUrl)) {
    if (redisUrl !== LOCAL_REDIS_URL) set("database", "redis_url", `"${LOCAL_REDIS_URL}"`);
  }

  const secret = tomlValue(text, "secret");
  if (secret.length < 32 || /CHANGE_ME/i.test(secret)) {
    set("session", "secret", `"${crypto.randomBytes(32).toString("hex")}"`);
  }

  return { text, changed };
}

function ensureConfig(dataDirPath, note) {
  const configPath = path.join(dataDirPath, "config.toml");
  const existed = fs.existsSync(configPath);

  let text = "";
  if (existed) {
    try {
      text = fs.readFileSync(configPath, "utf8");
    } catch {
      text = "";
    }
  }

  if (!text.trim()) {
    const templateCandidates = [
      path.join(serversRoot(), "config.example.toml"),
      path.join(__dirname, "..", "config.example.toml"),
    ];
    for (const file of templateCandidates) {
      try {
        text = fs.readFileSync(file, "utf8");
        break;
      } catch {
        /* keep looking */
      }
    }
  }
  if (!text.trim()) text = FALLBACK_CONFIG;

  const repaired = applyRequiredSettings(text, !existed);
  text = repaired.text;

  if (existed && repaired.changed.length === 0) return configPath;

  try {
    if (existed) fs.copyFileSync(configPath, `${configPath}.bak`);
    fs.writeFileSync(configPath, text, "utf8");
    if (note) {
      note(
        existed
          ? `[vektorsec] repaired ${configPath} (fixed: ${repaired.changed.join(", ")})`
          : `[vektorsec] first run: wrote default configuration to ${configPath}`,
      );
    }
  } catch (err) {
    if (note) note(`[vektorsec] could not write ${configPath}: ${err.message}`);
    return existed ? configPath : "";
  }
  return configPath;
}

/**
 * Forward child output to the log file and — when the process actually owns a
 * console (dev runs, `npm run electron:dev`) — to the terminal as well.
 */
function pipeOutput(child, stream) {
  const forward = (target, chunk) => {
    if (stream) stream.write(chunk);
    if (target && target.isTTY) {
      try {
        target.write(chunk);
      } catch {
        /* console went away */
      }
    }
  };
  if (child.stdout) child.stdout.on("data", (chunk) => forward(process.stdout, chunk));
  if (child.stderr) child.stderr.on("data", (chunk) => forward(process.stderr, chunk));
}

/** Start the backend once and keep a handle for a graceful shutdown. */
function startBackend(options = {}) {
  if (backendProcess) return backendProcess;

  const userDataDir = options.userDataDir || resolveUserDataDir();
  const dataDirPath = dataDir(userDataDir);
  const entry = backendEntry();
  const licenseKey = readLicenseKey(userDataDir);
  const publicKey = readLicensePublicKey();
  const logStream = openLogStream(userDataDir, "backend");
  backendLogStream = logStream;
  const note = (message) => {
    console.error(message);
    if (logStream) logStream.write(`${message}\n`);
  };

  ensureConfig(dataDirPath, note);

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    PORT: process.env.PORT || "8081",
    // config.toml / .env live in the per-user data dir, never inside the
    // (possibly read-only) install directory.
    DATA_DIR: process.env.DATA_DIR || dataDirPath,
  };
  if (licenseKey) env.VEKTORSEC_LICENSE_KEY = licenseKey;
  if (publicKey) env.VEKTORSEC_LICENSE_PUBLIC_KEY = publicKey;

  if (!fs.existsSync(entry)) {
    note(`[vektorsec] backend entry not found: ${entry}`);
    note("[vektorsec] build it first:  npm run build:backend  (or set VEKTORSEC_BACKEND_ENTRY)");
  }

  backendProcess = spawn(process.execPath, [entry], {
    cwd: path.join(serversRoot(), "backend"),
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: false,
  });

  pipeOutput(backendProcess, logStream);

  backendProcess.on("exit", (code, signal) => {
    note(`[vektorsec] backend exited (code=${code}, signal=${signal})`);
    if (backendLogStream) {
      try {
        backendLogStream.end();
      } catch {
        /* already closed */
      }
      backendLogStream = null;
    }
    backendProcess = null;
  });

  return backendProcess;
}

function stopBackend() {
  if (!backendProcess) return;
  const child = backendProcess;
  backendProcess = null;
  try {
    child.kill();
  } catch {
    /* already gone */
  }
}

/**
 * Start the Next.js gateway (UI + `/api` proxy) on its own port. The gateway is
 * the only server the browser talks to, exactly like in the Docker deployment.
 */
function startFrontend(options = {}) {
  if (frontendProcess) return frontendProcess;

  const entry = frontendEntry();
  const port = String(options.port || process.env.FRONTEND_PORT || "3001");
  const userDataDir = options.userDataDir || resolveUserDataDir();
  const logStream = openLogStream(userDataDir, "frontend");
  frontendLogStream = logStream;

  if (!fs.existsSync(entry)) {
    const message = `[vektorsec] frontend entry not found: ${entry}`;
    console.error(message);
    if (logStream) logStream.write(`${message}\n`);
    console.error("[vektorsec] build it first:  npm run build:frontend  (or set VEKTORSEC_FRONTEND_ENTRY)");
    return null;
  }

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    PORT: port,
    HOSTNAME: process.env.FRONTEND_HOSTNAME || "127.0.0.1",
    BACKEND_URI: process.env.BACKEND_URI || `http://127.0.0.1:${process.env.PORT || "8081"}`,
  };

  frontendProcess = spawn(process.execPath, [entry], {
    cwd: path.join(serversRoot(), "frontend"),
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: false,
  });

  pipeOutput(frontendProcess, logStream);

  frontendProcess.on("exit", (code, signal) => {
    const message = `[vektorsec] frontend exited (code=${code}, signal=${signal})`;
    console.error(message);
    if (frontendLogStream) {
      try {
        frontendLogStream.write(`${message}\n`);
        frontendLogStream.end();
      } catch {
        /* already closed */
      }
      frontendLogStream = null;
    }
    frontendProcess = null;
  });

  return frontendProcess;
}

function stopFrontend() {
  if (!frontendProcess) return;
  const child = frontendProcess;
  frontendProcess = null;
  try {
    child.kill();
  } catch {
    /* already gone */
  }
}

module.exports = {
  startBackend,
  stopBackend,
  backendEntry,
  frontendEntry,
  startFrontend,
  stopFrontend,
  readLicensePublicKey,
  dataDir,
  logDir,
  logFileFor,
  // Exposed so the desktop smoke test can verify config seeding/repair without
  // spawning the backend (see electron/README.md).
  ensureConfig,
};
