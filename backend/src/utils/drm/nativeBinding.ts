/**
 * Optional native DRM addon loader (anti-tamper).
 *
 * In shipped builds the exact hardware-fingerprint combination and the embedded
 * license public key can live inside a compiled C++ addon instead of plaintext
 * JavaScript, so the "secret" parts of the license check are not trivially
 * patchable by editing the JS bundle. When the addon is not present (dev /
 * tests / an unpackaged source checkout) this module falls back to the pure
 * JavaScript implementation in `hardwareId.ts`, so `tsc --noEmit` and the unit
 * suite keep passing without a native toolchain.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { collectHardwareFingerprint } from "./hardwareId";

interface DrmNativeAddon {
  getHardwareFingerprintParts(): string[];
  getEmbeddedLicensePublicKey(): string;
}

/** Override the addon location (tests / alternate packaging). */
export const NATIVE_ADDON_ENV = "VEKTORSEC_NATIVE_ADDON";

let cachedAddon: DrmNativeAddon | null | undefined;

function addonPath(): string {
  const override = process.env[NATIVE_ADDON_ENV];
  if (override) return override;
  // `backend/native/build/Release/drm_addon.node` relative to the backend cwd.
  return resolve(process.cwd(), "native", "build", "Release", "drm_addon.node");
}

function loadAddon(): DrmNativeAddon | null {
  if (cachedAddon !== undefined) return cachedAddon;
  try {
    const path = addonPath();
    if (!existsSync(path)) {
      cachedAddon = null;
      return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cachedAddon = require(path) as DrmNativeAddon;
  } catch {
    cachedAddon = null;
  }
  return cachedAddon;
}

/** true when the compiled addon is loaded and usable. */
export function isNativeDrmAvailable(): boolean {
  return loadAddon() !== null;
}

/** Raw fingerprint parts from the addon when available, else the JS collector. */
export async function collectHardwareFingerprintNative(): Promise<string[]> {
  const addon = loadAddon();
  if (addon) {
    try {
      const parts = addon.getHardwareFingerprintParts();
      if (Array.isArray(parts) && parts.length > 0) {
        return parts.filter((p): p is string => typeof p === "string" && p.length > 0);
      }
    } catch {
      /* fall back to JS */
    }
  }
  return collectHardwareFingerprint();
}

/** License public key embedded in the addon (`""` when not compiled in). */
export function getEmbeddedLicensePublicKey(): string {
  const addon = loadAddon();
  if (!addon) return "";
  try {
    const key = addon.getEmbeddedLicensePublicKey();
    return typeof key === "string" ? key.trim() : "";
  } catch {
    return "";
  }
}
