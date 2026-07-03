import { test } from "node:test";
import assert from "node:assert/strict";
import type OpenAI from "openai";
import {
  buildAnthropicMessageParams,
  buildAnthropicStreamParams,
  openaiToAnthropicMessages,
} from "../src/utils/llm/anthropicParams";

const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
  { role: "system", content: "You are a pentest orchestrator." },
  { role: "user", content: "Scan the target." },
];

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Run a shell command",
      parameters: {
        type: "object",
        properties: { cmd: { type: "string" } },
        required: ["cmd"],
      },
    },
  },
];

test("non-streaming params never include temperature", () => {
  const params = buildAnthropicMessageParams({ model: "claude-opus-4-8", messages });
  // Recent Anthropic models 400 on `temperature` and the OpenAI-shaped retry
  // handler cannot recover, so it must never be sent.
  assert.equal("temperature" in params, false);
  assert.equal(params.model, "claude-opus-4-8");
  assert.equal(params.max_tokens, 8192);
  assert.equal(params.system, "You are a pentest orchestrator.");
  assert.deepEqual(params.messages, [{ role: "user", content: "Scan the target." }]);
});

test("non-streaming params map tools and set tool_choice", () => {
  const params = buildAnthropicMessageParams({
    model: "claude-opus-4-8",
    messages,
    tools,
  });
  assert.deepEqual(params.tool_choice, { type: "auto" });
  assert.equal(params.tools?.[0]?.name, "run_command");
});

test("stream params without a thinking budget omit temperature and thinking", () => {
  const params = buildAnthropicStreamParams(
    { model: "claude-opus-4-8", messages },
    null,
  );
  assert.equal("temperature" in params, false);
  assert.equal("thinking" in params, false);
  assert.equal(params.stream, true);
  assert.equal(params.max_tokens, 8192);
});

test("stream params with a thinking budget omit temperature but enable thinking", () => {
  const params = buildAnthropicStreamParams(
    { model: "claude-opus-4-8", messages },
    10000,
  );
  assert.equal("temperature" in params, false);
  assert.deepEqual(params.thinking, { type: "enabled", budget_tokens: 10000 });
  // min(64000, max(16384, 10000 + 4096)) === 16384
  assert.equal(params.max_tokens, 16384);
});

test("openaiToAnthropicMessages folds system turns and maps tool results", () => {
  const { system, messages: mapped } = openaiToAnthropicMessages([
    { role: "system", content: "A" },
    { role: "system", content: "B" },
    { role: "user", content: "hi" },
    { role: "tool", tool_call_id: "call_1", content: "result" },
  ]);
  assert.equal(system, "A\nB");
  assert.equal(mapped[0]?.role, "user");
  assert.equal(mapped[1]?.role, "user");
  assert.deepEqual(mapped[1]?.content, [
    { type: "tool_result", tool_use_id: "call_1", content: "result" },
  ]);
});
