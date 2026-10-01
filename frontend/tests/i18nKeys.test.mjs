import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import en from "../src/i18n/locales/en.js";

/**
 * Guard for the i18n keys that are written as literals in the source.
 *
 * A typo like `t("common.svea")` silently renders the key itself in the UI, which
 * only shows up when someone opens that exact screen. This test scans the whole
 * `src` tree for `t("...")` / `translate("...")` calls — plus keys that are held
 * in a prop (`titleKey: "chat.consent.titleDefault"`) and only reach `t()` later —
 * and fails on any key that is not in the English dictionary (the source of truth
 * — Thai is checked for key parity in i18n.test.mjs).
 */

const SRC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

/** Flatten a nested dictionary into "a.b.c" -> value pairs. */
function flatten(dict, prefix = "") {
  const out = {};
  for (const [key, value] of Object.entries(dict)) {
    const path_ = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") {
      Object.assign(out, flatten(value, path_));
    } else {
      out[path_] = value;
    }
  }
  return out;
}

/** Every .js/.jsx file under `dir`, recursively. */
function walkFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(full));
    } else if (/\.jsx?$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

/** Literal keys are lowercase dotted paths: `t("vulnerabilities.title")`. */
const KEY_PATTERN = /\b(?:t|translate)\(\s*["']([a-z][\w.]*\.[\w.]+)["']/g;

/**
 * Keys stored in a prop and translated later: `{ titleKey: "chat.consent.x" }`.
 * Same failure mode as a `t()` typo, so it gets the same check.
 */
const KEY_PROP_PATTERN = /\b[a-zA-Z]+Key:\s*["']([a-z][\w.]*\.[\w.]+)["']/g;

test("every literal t(...) key in src exists in the English dictionary", () => {
  const flat = flatten(en);
  const missing = [];
  let checked = 0;

  const files = walkFiles(SRC_DIR);
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const pattern of [KEY_PATTERN, KEY_PROP_PATTERN]) {
      for (const match of source.matchAll(pattern)) {
        checked += 1;
        if (!(match[1] in flat)) {
          missing.push(`${path.relative(SRC_DIR, file)} → ${match[1]}`);
        }
      }
    }
  }

  assert.deepEqual(missing, []);
  // Keeps the scan honest: a broken regex would otherwise "pass" with zero keys.
  assert.ok(checked > 200, `expected hundreds of translated keys, found ${checked}`);
});
