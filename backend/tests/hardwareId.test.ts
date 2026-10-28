/**
 * Hardware-id unit tests (see `src/utils/drm/hardwareId.ts`).
 *
 * The HWID is the anchor every license is bound to, so the pure helpers are
 * pinned here: deterministic hashing (order-insensitive, de-duplicated),
 * stable formatting, and case/prefix-insensitive normalisation.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  formatHardwareId,
  hashHardwareId,
  normalizeHardwareId,
} from "../src/utils/drm/hardwareId";

test("hashing is order-insensitive and de-duplicated", () => {
  const a = hashHardwareId(["cpu:ABC", "mac:00:11:22:33:44:55"]);
  const b = hashHardwareId(["mac:00:11:22:33:44:55", "cpu:ABC"]);
  const c = hashHardwareId(["cpu:ABC", "mac:00:11:22:33:44:55", "cpu:ABC"]);

  assert.equal(a, b);
  assert.equal(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("hashing ignores empty and whitespace-only parts", () => {
  assert.equal(hashHardwareId(["a", "", "  ", "b"]), hashHardwareId(["a", "b"]));
  assert.equal(hashHardwareId([]), "");
  assert.equal(hashHardwareId(["   "]), "");
});

test("hashing is salted (a different salt yields a different HWID)", () => {
  assert.notEqual(hashHardwareId(["a"], "salt-1"), hashHardwareId(["a"], "salt-2"));
});

test("formatHardwareId renders a stable HWID-XXXX-… string", () => {
  const hwid = formatHardwareId("abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234");
  assert.equal(hwid, "HWID-ABCD-1234-ABCD-1234-ABCD-1234-ABCD-1234");
  assert.equal(formatHardwareId(""), "");
});

test("normalizeHardwareId is case/prefix/dash-insensitive", () => {
  assert.equal(normalizeHardwareId("HWID-ABCD-1234"), normalizeHardwareId("abcd1234"));
  assert.equal(normalizeHardwareId("HWID-ABCD-1234"), "ABCD1234");
  assert.equal(normalizeHardwareId(""), "");
});
