import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SSRF_BLOCK_ERROR,
  SsrfBlockedError,
  blockedTargetResult,
  extractHostnameFromTarget,
  extractTargetHostsFromText,
  isRestrictedIp,
  validateCommandTargetsSafety,
  validateTargetSafety,
} from "../src/utils/ssrfGuard";

// ─── IP range checks ─────────────────────────────────────────────────

test("isRestrictedIp blocks internal/private ranges", () => {
  // Loopback
  assert.equal(isRestrictedIp("127.0.0.1"), true);
  assert.equal(isRestrictedIp("127.255.255.255"), true);
  assert.equal(isRestrictedIp("::1"), true);
  assert.equal(isRestrictedIp("::ffff:127.0.0.1"), true);
  // Private networks
  assert.equal(isRestrictedIp("10.0.0.1"), true);
  assert.equal(isRestrictedIp("10.255.255.255"), true);
  assert.equal(isRestrictedIp("172.16.0.1"), true);
  assert.equal(isRestrictedIp("172.31.255.255"), true);
  assert.equal(isRestrictedIp("192.168.0.1"), true);
  assert.equal(isRestrictedIp("192.168.255.255"), true);
  // Cloud metadata
  assert.equal(isRestrictedIp("169.254.169.254"), true);
  assert.equal(isRestrictedIp("100.100.100.200"), true);
  // Link-local / CGNAT / reserved
  assert.equal(isRestrictedIp("169.254.1.1"), true);
  assert.equal(isRestrictedIp("100.64.0.1"), true);
  assert.equal(isRestrictedIp("0.0.0.1"), true);
  assert.equal(isRestrictedIp("224.0.0.1"), true);
  // IPv6 internal
  assert.equal(isRestrictedIp("fc00::1"), true);
  assert.equal(isRestrictedIp("fe80::1"), true);
  assert.equal(isRestrictedIp("::"), true);
  assert.equal(isRestrictedIp("2001:db8::1"), true);
});

test("isRestrictedIp allows public addresses", () => {
  assert.equal(isRestrictedIp("8.8.8.8"), false);
  assert.equal(isRestrictedIp("1.1.1.1"), false);
  assert.equal(isRestrictedIp("172.32.0.1"), false);
  assert.equal(isRestrictedIp("192.169.0.1"), false);
  assert.equal(isRestrictedIp("2606:4700:4700::1111"), false);
  assert.equal(isRestrictedIp(""), false);
  assert.equal(isRestrictedIp("not-an-ip"), false);
});

// ─── Host extraction ─────────────────────────────────────────────────

test("extractHostnameFromTarget normalises user inputs", () => {
  assert.equal(extractHostnameFromTarget("https://example.com/path?q=1#f"), "example.com");
  assert.equal(extractHostnameFromTarget("http://admin@10.0.0.1/"), "10.0.0.1");
  assert.equal(extractHostnameFromTarget("example.com:8080"), "example.com");
  assert.equal(extractHostnameFromTarget("10.0.0.1:8443"), "10.0.0.1");
  assert.equal(extractHostnameFromTarget("[::1]:8080"), "::1");
  assert.equal(extractHostnameFromTarget("::1"), "::1");
  assert.equal(extractHostnameFromTarget("localhost"), "localhost");
  assert.equal(extractHostnameFromTarget("example.com"), "example.com");
  assert.equal(extractHostnameFromTarget(""), "");
});

test("extractTargetHostsFromText finds targets and ignores files/flags", () => {
  assert.deepEqual(extractTargetHostsFromText("nmap -sV -p 1-1000 10.10.10.10"), ["10.10.10.10"]);
  assert.deepEqual(
    extractTargetHostsFromText("nmap -sV -oN scan.txt 8.8.8.8"),
    ["8.8.8.8"],
  );
  assert.deepEqual(
    extractTargetHostsFromText("sqlmap -u https://example.com/page?id=1 --batch"),
    ["example.com"],
  );
  assert.deepEqual(
    extractTargetHostsFromText("curl -s http://localhost:8080/health"),
    ["localhost"],
  );
  assert.deepEqual(
    extractTargetHostsFromText("hydra -l admin -P /usr/share/wordlists/rockyou.txt 10.0.0.1 ssh"),
    ["10.0.0.1"],
  );
  assert.deepEqual(extractTargetHostsFromText("ssh user@10.0.0.2"), ["10.0.0.2"]);
  assert.deepEqual(extractTargetHostsFromText("scp user@192.168.1.5:/etc/passwd /tmp/"), ["192.168.1.5"]);
  assert.deepEqual(extractTargetHostsFromText("git clone git@github.com:user/repo.git"), ["github.com"]);
  assert.deepEqual(extractTargetHostsFromText("ls -la && cat /etc/passwd"), []);
  assert.deepEqual(extractTargetHostsFromText("echo hello"), []);
});

// ─── Validation ──────────────────────────────────────────────────────

test("validateTargetSafety blocks internal targets", async () => {
  for (const target of [
    "127.0.0.1",
    "localhost",
    "http://localhost:3000/",
    "10.0.0.5",
    "172.16.0.5:22",
    "192.168.1.1",
    "169.254.169.254",
    "100.100.100.200",
    "[::1]",
  ]) {
    const result = await validateTargetSafety(target);
    assert.equal(result.allowed, false, `expected '${target}' to be blocked`);
  }
});

test("validateTargetSafety allows public targets", async () => {
  for (const target of ["8.8.8.8", "1.1.1.1:443", "https://example.com/", "172.32.0.1"]) {
    const result = await validateTargetSafety(target);
    assert.equal(result.allowed, true, `expected '${target}' to be allowed`);
  }
});

test("validateTargetSafety rejects unresolvable hosts by default but can allow them", async () => {
  const bad = "definitely-not-a-real-host-9f3k.invalid";
  const strict = await validateTargetSafety(bad);
  assert.equal(strict.allowed, false);

  const lenient = await validateTargetSafety(bad, { allowDnsFailure: true });
  assert.equal(lenient.allowed, true);
});

test("SSRF protection can be disabled via SSRF_ENABLED env (Admin > Security)", async () => {
  const prev = process.env.SSRF_ENABLED;
  try {
    process.env.SSRF_ENABLED = "0";
    const result = await validateTargetSafety("127.0.0.1");
    assert.equal(result.allowed, true, "disabled guard must allow internal targets");
    const cmd = await validateCommandTargetsSafety("curl http://192.168.1.1/");
    assert.equal(cmd.allowed, true);
  } finally {
    if (prev === undefined) delete process.env.SSRF_ENABLED;
    else process.env.SSRF_ENABLED = prev;
  }

  // Enabled again (default).
  const blocked = await validateTargetSafety("10.0.0.5");
  assert.equal(blocked.allowed, false);
});

test("validateCommandTargetsSafety blocks commands targeting internal hosts", async () => {
  const result = await validateCommandTargetsSafety("curl -s http://192.168.1.1/");
  assert.equal(result.allowed, false);
  const ok = await validateCommandTargetsSafety("nmap -sV -oN out.txt 8.8.8.8");
  assert.equal(ok.allowed, true);
  const none = await validateCommandTargetsSafety("ls -la");
  assert.equal(none.allowed, true);
});

test("SsrfBlockedError and blockedTargetResult carry the required message", () => {
  const err = new SsrfBlockedError();
  assert.equal(err.message, SSRF_BLOCK_ERROR);
  assert.equal(err.name, "SsrfBlockedError");

  const result = blockedTargetResult();
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /Target IP\/Domain is restricted for security reasons/);
});
