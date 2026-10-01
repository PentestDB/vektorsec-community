import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SCAN_ARG_KEYS,
  SCAN_TOOL_BY_ACTION,
  buildScanToolArgs,
} from "../src/utils/scanToolArgs";

test("every scan action maps to a registry tool", () => {
  assert.deepEqual(Object.keys(SCAN_TOOL_BY_ACTION).sort(), [
    "ffuf",
    "gobuster",
    "naabu",
    "nmap",
    "nuclei",
  ]);
  for (const action of Object.keys(SCAN_TOOL_BY_ACTION)) {
    assert.ok(
      SCAN_ARG_KEYS[action]?.includes("target"),
      `${action} must accept a target`,
    );
    assert.match(SCAN_TOOL_BY_ACTION[action], /^[a-z_]+$/);
  }
});

test("buildScanToolArgs forwards only the arguments the action supports", () => {
  const args = buildScanToolArgs("nmap", {
    target: "10.0.0.5",
    ports: "80,443",
    scan_type: "syn",
    extra_flags: ["-Pn"],
    // Not an nmap argument — must be dropped.
    wordlist: "/usr/share/wordlists/dirb/common.txt",
    engagement_id: "eng-1",
  });

  assert.deepEqual(args, {
    target: "10.0.0.5",
    ports: "80,443",
    scan_type: "syn",
    extra_flags: ["-Pn"],
  });
});

test("buildScanToolArgs drops empty values", () => {
  const args = buildScanToolArgs("naabu", {
    target: "example.com",
    ports: "",
    top_ports: undefined,
    extra_flags: null,
  });
  assert.deepEqual(args, { target: "example.com" });
});

test("buildScanToolArgs keeps numeric and array values intact", () => {
  const args = buildScanToolArgs("gobuster", {
    target: "https://example.com",
    mode: "dir",
    threads: 20,
    extensions: ["php", "bak"],
  });
  assert.deepEqual(args, {
    target: "https://example.com",
    mode: "dir",
    threads: 20,
    extensions: ["php", "bak"],
  });
});

test("buildScanToolArgs requires a target", () => {
  assert.throws(
    () => buildScanToolArgs("nuclei", { severity: "high" }),
    /target is required/,
  );
});

test("mode-based scanners require a mode", () => {
  assert.throws(
    () => buildScanToolArgs("ffuf", { target: "https://example.com" }),
    /mode is required for ffuf \(content\|subdomain\)/,
  );
  assert.throws(
    () => buildScanToolArgs("gobuster", { target: "example.com" }),
    /mode is required for gobuster \(dir\|dns\|vhost\)/,
  );
  assert.deepEqual(
    buildScanToolArgs("ffuf", { target: "https://example.com", mode: "content" }),
    { target: "https://example.com", mode: "content" },
  );
});

test("unknown actions are rejected before anything runs", () => {
  assert.throws(
    () => buildScanToolArgs("sqlmap", { target: "example.com" }),
    /Unsupported scan action: sqlmap/,
  );
  assert.throws(() => buildScanToolArgs("", {}), /Unsupported scan action/);
});
