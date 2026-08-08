import { test } from "node:test";
import assert from "node:assert/strict";

// Keep oob.service on the in-memory store so tests don't boot the server.
process.env.NODE_ENV = "test";

import {
  createOobPayload,
  recordOobInteraction,
  pollOobInteractions,
  isValidOobToken,
  extractOobTokenFromHost,
  buildPayloadUrls,
} from "../src/services/oob.service";
import {
  AttackChain,
  formatAttackChainState,
  formatTargetMemoryEntries,
  TargetMemoryStore,
} from "../src/services/attackChain";

test("oob token validation accepts hex tokens and rejects junk", () => {
  assert.equal(isValidOobToken("3f9a7c21a0b1c2d3e4f5061728394a5b"), true);
  assert.equal(isValidOobToken("abc"), false);
  assert.equal(isValidOobToken("zzz..."), false);
  assert.equal(isValidOobToken(""), false);
  assert.equal(isValidOobToken(null), false);
});

test("extractOobTokenFromHost pulls the token from a subdomain host", () => {
  assert.equal(
    extractOobTokenFromHost("3f9a7c21a0b1c2d3e4f5061728394a5b.oob.vektorsec.local"),
    "3f9a7c21a0b1c2d3e4f5061728394a5b",
  );
  assert.equal(extractOobTokenFromHost("app.vektorsec.local"), null);
  assert.equal(extractOobTokenFromHost("localhost:8080"), null);
  assert.equal(extractOobTokenFromHost(undefined), null);
});

test("buildPayloadUrls produces path and host payloads", () => {
  const token = "3f9a7c21a0b1c2d3e4f5061728394a5b";
  const urls = buildPayloadUrls("http://localhost:8080", token);
  assert.equal(urls.pathUrl, `http://localhost:8080/api/oob/callback/${token}`);
  assert.equal(urls.hostUrl, `${token}.oob.localhost:8080`);
});

test("oob payload generation, interaction recording and polling (memory store)", async () => {
  const payload = await createOobPayload("XXE in /submit");
  assert.equal(isValidOobToken(payload.token), true);
  assert.ok(payload.expiresAt > payload.createdAt);

  const before = await pollOobInteractions(payload.token);
  assert.equal(before.interactions.length, 0);

  await recordOobInteraction(payload.token, {
    method: "GET",
    path: "/api/oob/callback/" + payload.token,
    protocol: "http",
    host: "localhost:8080",
    remoteAddress: "10.0.0.5",
    headers: { "user-agent": "curl/8" },
  });
  await recordOobInteraction(payload.token, {
    method: "POST",
    path: "/",
    bodyPreview: "<hello/>",
  });

  const after = await pollOobInteractions(payload.token);
  assert.equal(after.interactions.length, 2);
  assert.equal(after.interactions[0].method, "GET");
  assert.equal(after.interactions[1].bodyPreview, "<hello/>");
});

test("oob recordOobInteraction ignores invalid tokens", async () => {
  await recordOobInteraction("bad", { method: "GET", path: "/" });
  const result = await pollOobInteractions("bad");
  assert.equal(result.interactions.length, 0);
});

test("attack chain serializes and hydrates from persisted state", () => {
  const chain = new AttackChain("session-1");
  chain.addStep({ phase: "recon", action: "Nmap scan", target: "10.0.0.1", tool: "nmap" });
  chain.remember("recon", "Open ports: 80, 443");
  chain.advancePhase();

  const state = chain.toState();
  const restored = AttackChain.fromState("session-1", state);
  assert.equal(restored.currentPhase, "enumeration");
  assert.equal(restored.state.steps.length, 1);
  assert.deepEqual(restored.getAllMemory(), ["Open ports: 80, 443"]);

  const block = restored.toPromptBlock();
  assert.match(block, /<attack_chain/);
  assert.match(block, /Nmap scan/);
});

test("formatAttackChainState renders persisted state and skips empty chains", () => {
  assert.equal(formatAttackChainState(null), "");
  assert.equal(formatAttackChainState({ currentPhase: "recon" }), "");
  const chain = new AttackChain("session-2");
  chain.addStep({ phase: "recon", action: "dirbuster", target: "http://app" });
  const block = formatAttackChainState(chain.toState());
  assert.match(block, /dirbuster/);
});

test("target memory store hydrates and formats persisted entries", () => {
  const store = new TargetMemoryStore("session-3");
  const entry = store.add({
    target: "10.0.0.1",
    source: "nmap",
    dataType: "service",
    content: "443/tcp https",
  });
  store.add({
    target: "10.0.0.1",
    source: "ffuf",
    dataType: "url",
    content: "/admin",
  });
  const all = store.getAll();
  assert.equal(all.length, 2);

  const block = formatTargetMemoryEntries(all);
  assert.match(block, /<target_memory>/);
  assert.match(block, /443\/tcp https/);
  assert.match(block, /\/admin/);

  const hydrated = new TargetMemoryStore("session-3");
  hydrated.hydrate(entry);
  assert.equal(hydrated.getAll().length, 1);
  assert.equal(hydrated.getAll()[0].source, "nmap");
});
