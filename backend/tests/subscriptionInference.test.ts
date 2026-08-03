import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getSubscriptionProviderStatuses,
  invokeSubscriptionInference,
} from "../src/services/subscription-inference.service";

let binDir: string;
let previousPath: string | undefined;

function writeExecutable(name: string, source: string) {
  const target = path.join(binDir, name);
  fs.writeFileSync(target, `#!/usr/bin/env node\n${source}\n`, { mode: 0o755 });
}

before(() => {
  binDir = fs.mkdtempSync(path.join(os.tmpdir(), "subscription-cli-test-"));
  previousPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${previousPath || ""}`;

  writeExecutable(
    "codex",
    `const args = process.argv.slice(2);
if (args[0] === "--version") { console.log("codex-cli 9.9.9"); process.exit(0); }
if (args[0] === "login" && args[1] === "status") { console.log("Logged in using ChatGPT"); process.exit(0); }
process.stdin.resume();
process.stdin.on("end", () => {
  console.log(JSON.stringify({type:"item.completed",item:{type:"agent_message",text:JSON.stringify({content:null,reasoning:"checked",toolCalls:[{id:"call_1",name:"run_bash",arguments:JSON.stringify({cmd:"id"})}],finishReason:"tool_calls"})}}));
  console.log(JSON.stringify({type:"turn.completed",usage:{input_tokens:12,output_tokens:7}}));
});`,
  );
  writeExecutable(
    "claude",
    `const args = process.argv.slice(2);
if (args[0] === "--version") { console.log("9.9.9 (Claude Code)"); process.exit(0); }
if (args[0] === "auth" && args[1] === "status") { console.log(JSON.stringify({loggedIn:true,authMethod:"claude.ai",email:"local@example.com"})); process.exit(0); }
process.stdin.resume();
process.stdin.on("end", () => console.log(JSON.stringify({structured_output:{content:"connected",reasoning:null,toolCalls:[],finishReason:"stop"},usage:{input_tokens:5,output_tokens:2}})));`,
  );
});

after(() => {
  process.env.PATH = previousPath;
  fs.rmSync(binDir, { recursive: true, force: true });
});

test("Codex subscription maps structured tool calls into the normal contract", async () => {
  const result = await invokeSubscriptionInference({
    provider: "codex-subscription",
    model: "gpt-5.6-terra",
    reasoningMode: "high",
    messages: [{ role: "user", content: "Who am I?" }],
    tools: [],
  });
  assert.equal(result.finishReason, "tool_calls");
  assert.equal(result.reasoning, "checked");
  assert.deepEqual(result.toolCalls[0], {
    id: "call_1",
    name: "run_bash",
    arguments: '{"cmd":"id"}',
  });
  assert.equal(result.usage?.total_tokens, 19);
});

test("Claude subscription maps structured text into the normal contract", async () => {
  const result = await invokeSubscriptionInference({
    provider: "claude-subscription",
    model: "claude-opus-5",
    reasoningMode: "low",
    messages: [{ role: "user", content: "Reply connected" }],
  });
  assert.equal(result.content, "connected");
  assert.equal(result.finishReason, "stop");
  assert.deepEqual(result.toolCalls, []);
  assert.equal(result.usage?.total_tokens, 7);
});

test("subscription provider probe reports installed authenticated CLIs", async () => {
  const statuses = await getSubscriptionProviderStatuses();
  assert.equal(statuses.every((status) => status.installed), true);
  assert.equal(statuses.every((status) => status.authenticated), true);
  assert.equal(statuses[0]?.models.includes("gpt-5.6-sol"), true);
  assert.equal(statuses[1]?.models.includes("claude-opus-5"), true);
});
