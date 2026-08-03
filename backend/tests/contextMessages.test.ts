import { test } from "node:test";
import assert from "node:assert/strict";
import { messagesToOpenAI } from "../src/services/context.service";
import type { AgentMessageDoc } from "../src/models/Sessions/Sessions.model";

const assistantTurn: AgentMessageDoc = {
  id: "assistant-1",
  role: "assistant",
  content: null,
  reasoning: "I should inspect the target first.",
  toolCalls: [{ id: "call-1", name: "lookup_target", arguments: '{"target":"example.com"}' }],
  timestamp: new Date(0),
  turnIndex: 1,
};

const toolTurn: AgentMessageDoc = {
  id: "tool-1",
  role: "tool",
  content: "93.184.216.34",
  toolCallId: "call-1",
  toolName: "lookup_target",
  timestamp: new Date(0),
  turnIndex: 1,
};

test("Kimi continuation preserves reasoning_content with tool calls", () => {
  const converted = messagesToOpenAI([assistantTurn, toolTurn], true);
  assert.equal((converted[0] as { reasoning_content?: string }).reasoning_content, assistantTurn.reasoning);
  assert.equal(converted[0].role, "assistant");
  assert.equal(converted[1].role, "tool");
});

test("standard OpenAI-compatible messages omit provider-specific reasoning_content", () => {
  const converted = messagesToOpenAI([assistantTurn, toolTurn]);
  assert.equal("reasoning_content" in converted[0], false);
});
