"use strict";

/**
 * Electron-side DRM helpers (main process).
 *
 * These mirror `backend/src/utils/drm/` in plain CommonJS so the shell can show
 * the customer their HWID and give instant feedback on a pasted license key
 * without round-tripping through the backend. The **authoritative** fail-closed
 * enforcement is still the backend's `licenseManager`; this module is a display
 * + convenience layer only.
 */

const { execFile } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const LICENSE_PREFIX = "VEKL1";
const LICENSE_SUBJECT = "vektorsec-license";
const LICENSE_VERSION = 1;
const LICENSE_TYPES = ["trial", "60d", "1y", "unlimited"];
const HWID_SALT = "vektorsec-hwid-v1";

function run(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 5000, windowsHide: true }, (err, stdout) =>
      resolve(err ? "" : String(stdout || "")),
    );
  });
}

function firstMac() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] || []) {
      const mac = (info.mac || "").trim().toUpperCase();
      if (!info.internal && mac && mac !== "00:00:00:00:00:00") return mac;
    }
  }
  return "";
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromB64url(str) {
  const s = String(str).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(s.length % 4 === 0 ? s : s + "=".repeat(4 - (s.length % 4)), "base64");
}

function normalizeHwid(value) {
  return String(value || "").replace(/^hwid/i, "").replace(/[^0-9a-z]/gi, "").toUpperCase();
}

async function collectFingerprint() {
  const parts = [];
  const mac = firstMac();
  if (mac) parts.push(`mac:${mac}`);
  if (process.platform === "win32") {
    const [product, board, bios, cpu, disk] = await Promise.all([
      run("wmic", ["csproduct", "get", "uuid"]),
      run("wmic", ["baseboard", "get", "serialnumber"]),
      run("wmic", ["bios", "get", "serialnumber"]),
      run("wmic", ["cpu", "get", "processorid"]),
      run("wmic", ["diskdrive", "get", "serialnumber"]),
    ]);
    for (const raw of [product, board, bios, cpu, disk]) {
      for (const line of String(raw).split(/\r?\n/)) {
        const value = line.trim();
        if (value && !/^(uuid|serialnumber|processorid)$/i.test(value) && !parts.includes(value)) {
          parts.push(value);
          break;
        }
      }
    }
  } else if (process.platform === "linux") {
    for (const f of ["/etc/machine-id", "/sys/class/dmi/id/product_uuid", "/sys/class/dmi/id/board_serial"]) {
      try {
        const v = fs.readFileSync(f, "utf8").trim();
        if (v) parts.push(`${path.basename(f)}:${v}`);
      } catch {
        /* optional */
      }
    }
  }
  return parts;
}

function hashHardwareId(parts) {
  const unique = Array.from(new Set(parts.map((p) => String(p).trim()).filter(Boolean)));
  if (!unique.length) return "";
  unique.sort();
  return crypto.createHash("sha256").update(`${HWID_SALT}\u0000${unique.join("\u0001")}`, "utf8").digest("hex");
}

function formatHardwareId(hash) {
  const hex = String(hash).replace(/[^0-9a-f]/gi, "").toUpperCase();
  if (!hex) return "";
  return `HWID-${(hex.slice(0, 32).match(/.{1,4}/g) || [hex]).join("-")}`;
}

async function computeHardwareId() {
  return formatHardwareId(hashHardwareId(await collectFingerprint()));
}

function toPublicKey(input) {
  if (!input) return null;
  const value = String(input).trim().replace(/\\n/g, "\n");
  try {
    if (value.includes("BEGIN PUBLIC KEY")) return crypto.createPublicKey(value);
    const der = fromB64url(value);
    if (der.length === 32) {
      return crypto.createPublicKey({
        key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), der]),
        format: "der",
        type: "spki",
      });
    }
    return crypto.createPublicKey({ key: der, format: "der", type: "spki" });
  } catch {
    return null;
  }
}

function verifyLicenseKey(token, publicKey, hwid, nowMs = Date.now()) {
  const raw = String(token || "").trim();
  if (!raw) return { valid: false, reason: "missing" };
  const parts = raw.split(".");
  if (parts.length !== 3 || parts[0] !== LICENSE_PREFIX) return { valid: false, reason: "malformed" };
  const [, payloadB64, sigB64] = parts;

  let payload;
  try {
    payload = JSON.parse(fromB64url(payloadB64).toString("utf8"));
  } catch {
    return { valid: false, reason: "malformed" };
  }
  if (payload?.v !== LICENSE_VERSION) return { valid: false, reason: "unsupported-version" };
  if (payload?.sub !== LICENSE_SUBJECT) return { valid: false, reason: "wrong-subject" };
  if (!LICENSE_TYPES.includes(payload?.typ)) return { valid: false, reason: "unknown-type" };

  const key = toPublicKey(publicKey);
  if (!key) return { valid: false, reason: "no-verification-key" };
  let ok = false;
  try {
    ok = crypto.verify(null, Buffer.from(`${parts[0]}.${payloadB64}`, "utf8"), key, fromB64url(sigB64));
  } catch {
    ok = false;
  }
  if (!ok) return { valid: false, reason: "bad-signature" };

  if (normalizeHwid(payload.hwid) !== normalizeHwid(hwid)) {
    return { valid: false, reason: "hwid-mismatch" };
  }
  const expiresAt = payload.exp === null ? null : new Date(payload.exp * 1000).toISOString();
  if (payload.typ !== "unlimited" && payload.exp * 1000 <= nowMs) {
    return { valid: false, reason: "expired", expiresAt };
  }
  return { valid: true, type: payload.typ, client: payload.c, hwid: payload.hwid, expiresAt };
}

async function getLicenseInfo({ licenseKey, publicKey } = {}) {
  const hwid = await computeHardwareId();
  const verification = verifyLicenseKey(licenseKey, publicKey, hwid);
  return {
    hwid,
    licensed: verification.valid,
    type: verification.type || null,
    client: verification.client || null,
    expiresAt: verification.expiresAt ?? null,
    reason: verification.valid ? null : verification.reason,
  };
}

module.exports = { computeHardwareId, verifyLicenseKey, getLicenseInfo };

