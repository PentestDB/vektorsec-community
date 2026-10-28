/**
 * Hardware fingerprint (HWID) for the VektorSec standalone desktop build.
 *
 * The HWID binds a license key to exactly one machine. It is assembled from
 * identifiers that are cheap to read on every OS, then reduced to a stable,
 * human-friendly `HWID-XXXX-XXXX-…` string:
 *
 *   - Windows : `wmic` (board serial, BIOS serial, CPU ID, product UUID,
 *               disk serial) + first physical MAC.
 *   - Linux   : `/etc/machine-id`, DMI UUID / board serial / product serial
 *               (best effort) + first physical MAC.
 *   - macOS   : `ioreg` platform UUID / serial, `sysctl kern.hostuuid`
 *               + first physical MAC.
 *
 * Only the final HWID string is ever compared with a license — never the raw
 * identifiers — so a machine can expose its HWID to the operator without
 * leaking motherboard/CPU serials. Keep the salt + grouping stable across
 * releases or every existing license would silently stop matching its machine.
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";

/** Salt mixed into the HWID hash. Changing it re-keys every customer machine. */
export const HARDWARE_ID_SALT = "vektorsec-hwid-v1";

/** Number of hex chars surfaced in the human-friendly HWID (32 = 128-bit). */
export const HARDWARE_ID_HEX_LENGTH = 32;

/** Run a system command and resolve to trimmed stdout, or `""` on any error. */
function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { timeout: 5000, windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout) => resolve(err ? "" : String(stdout ?? "")),
    );
  });
}

/** First non-internal, non-zero MAC address (upper-cased), or `""`. */
export function firstMacAddress(): string {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const info of interfaces[name] ?? []) {
      const mac = (info.mac ?? "").trim().toUpperCase();
      if (!info.internal && mac && mac !== "00:00:00:00:00:00") return mac;
    }
  }
  return "";
}

/**
 * Turn the `Name` lines of a `wmic … get Name1,Name2` table into fingerprint
 * parts. The output is `header\nvalue1\nvalue2\n…`; we drop the header and
 * blank lines, trim, and keep the first meaningful value per field so multiple
 * columns never produce duplicate rows.
 */
function pushWmicValues(stdout: string, headerTokens: string[], into: string[]): void {
  const header = headerTokens.join("").toLowerCase();
  const lines = String(stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.toLowerCase() !== header);
  for (const line of lines) {
    if (!into.includes(line)) into.push(line);
    break; // only the first (primary) row is needed
  }
}

/** Grab a stable identifier from a readable file (`""` when missing). */
function readFilePart(file: string, label: string, into: string[]): void {
  try {
    const value = readFileSync(file, "utf8").trim();
    if (value) into.push(`${label}:${value}`);
  } catch {
    /* optional source — ignore */
  }
}

/**
 * Collect the raw identifiers available on this machine (best effort: every
 * source is optional and failures are ignored, but the MAC is always attempted
 * so a machine rarely ends up with an empty fingerprint).
 */
export async function collectHardwareFingerprint(): Promise<string[]> {
  const parts: string[] = [];
  const mac = firstMacAddress();
  if (mac) parts.push(`mac:${mac}`);

  switch (process.platform) {
    case "win32": {
      const [product, board, bios, cpu, disk] = await Promise.all([
        run("wmic", ["csproduct", "get", "uuid"]),
        run("wmic", ["baseboard", "get", "serialnumber"]),
        run("wmic", ["bios", "get", "serialnumber"]),
        run("wmic", ["cpu", "get", "processorid"]),
        run("wmic", ["diskdrive", "get", "serialnumber"]),
      ]);
      pushWmicValues(product, ["uuid"], parts);
      pushWmicValues(board, ["serialnumber"], parts);
      pushWmicValues(bios, ["serialnumber"], parts);
      pushWmicValues(cpu, ["processorid"], parts);
      pushWmicValues(disk, ["serialnumber"], parts);
      break;
    }
    case "linux": {
      readFilePart("/etc/machine-id", "machine-id", parts);
      readFilePart("/sys/class/dmi/id/product_uuid", "product-uuid", parts);
      readFilePart("/sys/class/dmi/id/board_serial", "board-serial", parts);
      readFilePart("/sys/class/dmi/id/product_serial", "product-serial", parts);
      break;
    }
    case "darwin": {
      const [ioreg, hostuuid] = await Promise.all([
        run("ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"]),
        run("sysctl", ["-n", "kern.hostuuid"]),
      ]);
      for (const line of String(ioreg).split(/\r?\n/)) {
        const match = /"(?:IOPlatformUUID|IOPlatformSerialNumber)"\s*=\s*"([^"]+)"/.exec(line);
        if (match?.[1]) parts.push(match[1]);
      }
      const uuid = String(hostuuid).trim();
      if (uuid) parts.push(`hostuuid:${uuid}`);
      break;
    }
    default:
      break;
  }

  return parts;
}

/**
 * Reduce raw identifiers to a stable SHA-256 hex digest. Pure and
 * deterministic: sorted + de-duplicated inputs, so the order of collection
 * never matters. Returns `""` when there is nothing to hash (fail-closed).
 */
export function hashHardwareId(parts: readonly string[], salt: string = HARDWARE_ID_SALT): string {
  const unique = Array.from(new Set(parts.map((p) => String(p).trim()).filter(Boolean)));
  if (unique.length === 0) return "";
  unique.sort();
  return createHash("sha256")
    .update(`${salt}\u0000${unique.join("\u0001")}`, "utf8")
    .digest("hex");
}

/** Render a hex digest as `HWID-XXXX-XXXX-…` (no dashes/prefix on empty). */
export function formatHardwareId(hash: string): string {
  const hex = String(hash).replace(/[^0-9a-f]/gi, "").toUpperCase();
  if (!hex) return "";
  const groups = hex.slice(0, HARDWARE_ID_HEX_LENGTH).match(/.{1,4}/g) ?? [hex];
  return `HWID-${groups.join("-")}`;
}

/**
 * Normalise any HWID representation (with/without the `HWID-` prefix, lower/
 * upper case, stray dashes) to its canonical, comparable form: the raw hex.
 */
export function normalizeHardwareId(value: string): string {
  return String(value ?? "")
    .replace(/^hwid/i, "")
    .replace(/[^0-9a-z]/gi, "")
    .toUpperCase();
}

/** Compute this machine's final HWID (async — shells out to the OS). */
export async function computeHardwareId(): Promise<string> {
  return formatHardwareId(hashHardwareId(await collectHardwareFingerprint()));
}
