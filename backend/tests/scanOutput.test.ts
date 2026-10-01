import assert from "node:assert/strict";
import test from "node:test";
import {
  parseNmapOutput,
  parseNaabuOutput,
  parseFfufOutput,
  parseGobusterDirOutput,
  parseGobusterDnsOutput,
  parseNucleiOutput,
  scorePorts,
  scoreNuclei,
  buildStructuredScanResult,
} from "../src/utils/scanOutput";

const NMAP_SAMPLE = `Starting Nmap 7.92 ( https://nmap.org ) at ...
Nmap scan report for example.com (93.184.216.34)
Host is up (0.020s latency).
Not shown: 997 closed ports
PORT     STATE SERVICE  VERSION
22/tcp   open  ssh      OpenSSH 7.4
80/tcp   open  http     nginx 1.16.1
443/tcp  open  https    nginx
8080/tcp open  http-proxy
Nmap done: 1 IP address (1 host up) scanned in 3.42 seconds`;

test("parseNmapOutput extracts open ports from the port table", () => {
  const ports = parseNmapOutput(NMAP_SAMPLE);
  assert.equal(ports.length, 4);
  assert.equal(ports[0].host, "example.com");
  assert.equal(ports[0].port, 22);
  assert.equal(ports[0].service, "ssh");
  assert.equal(ports[1].service, "http");
  assert.equal(ports.every((p) => p.state === "open"), true);
});

test("parseNaabuOutput handles JSONL and host:port lines", () => {
  const jsonl = `{"host":"93.184.216.34","port":80,"protocol":"tcp"}\n{"host":"93.184.216.34","port":443,"protocol":"tcp"}`;
  const plain = "example.com:22\n93.184.216.34:443";
  assert.equal(parseNaabuOutput(jsonl).length, 2);
  assert.equal(parseNaabuOutput(plain).length, 2);
});

test("parseFfufOutput reads ffuf JSON results", () => {
  const sample = JSON.stringify({
    results: [
      { url: "http://example.com/admin", status: 200, length: 1042, words: 99, lines: 12 },
      { url: "http://example.com/login.php", status: 301, length: 0, redirectlocation: "http://example.com/login/" },
    ],
  });
  const out = parseFfufOutput(sample);
  assert.equal(out.length, 2);
  assert.equal(out[0].status, 200);
  assert.equal(out[1].redirectTo, "http://example.com/login/");
});

test("gobuster parsers normalize dir and dns output", () => {
  const dirs = parseGobusterDirOutput(
    "/admin (Status: 301) [Size: 169] [--> http://example.com/admin/]\n/config.php (Status: 200) [Size: 19]",
    "https://example.com",
  );
  assert.equal(dirs.length, 2);
  assert.equal(dirs[0].status, 301);
  assert.match(dirs[0].url, /^https:\/\/example\.com\/admin$/);

  const subs = parseGobusterDnsOutput("Found: api.example.com\nFound: dev.example.com");
  assert.equal(subs.length, 2);
  assert.equal(subs[0].subdomain, "api.example.com");
});

test("parseNucleiOutput normalizes JSONL and text lines with severity", () => {
  const jsonl = [
    JSON.stringify({
      templateID: "http-missing-security-headers",
      info: { name: "Missing Security Headers", severity: "low", tags: ["security", "headers"] },
      matched_at: "https://example.com/",
      matcher_name: "x-frame-options",
      type: "http",
    }),
    JSON.stringify({
      template_id: "CVE-2023-1234",
      info: { severity: "critical", name: "Critical RCE" },
      matched_at: "https://example.com/admin",
      type: "http",
    }),
  ].join("\n");
  const findings = parseNucleiOutput(jsonl);
  assert.equal(findings.length, 2);
  assert.equal(findings[0].severity, "low");
  assert.equal(findings[0].templateId, "http-missing-security-headers");
  assert.equal(findings[1].severity, "critical");
});

test("risk scoring + structured result builder", () => {
  const ports = parseNmapOutput(NMAP_SAMPLE);
  const risk = scorePorts(ports);
  assert.ok(risk.score >= 1 && risk.score <= 10);
  assert.match(risk.level, /low|medium|high|critical/);

  const result = buildStructuredScanResult({
    tool: "nuclei",
    engine: "nuclei",
    target: "https://example.com",
    scanKind: "vulnerabilities",
    findings: parseNucleiOutput(
      JSON.stringify({ template_id: "t-1", info: { severity: "critical", name: "RCE" }, matched_at: "https://example.com/" }),
    ),
    rawText: "raw log line",
  });
  assert.equal(result.counts.vulnerabilities, 1);
  assert.equal(result.counts.severity_critical, 1);
  assert.equal(result.risk.level, "critical");
  assert.equal(typeof result.summary, "string");
  assert.equal(typeof result.scannedAt, "string");
});
