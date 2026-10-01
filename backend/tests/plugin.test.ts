import assert from "node:assert/strict";
import test from "node:test";
import { toolRegistry } from "../src/tools/registry";
import {
  defineTool,
  registerTool,
  registerTools,
  unregisterTool,
  isToolRegistered,
} from "../src/tools/plugin";

const TEST_TOOL_NAME = "__plugin_test_echo__";

function sampleTool(name = TEST_TOOL_NAME) {
  return defineTool({
    name,
    description: "test plugin tool",
    parameters: { type: "object", properties: { text: { type: "string" } } },
    async execute(args) {
      return { output: `echo:${args.text ?? ""}`, exitCode: 0 };
    },
  });
}

test("defineTool validates and fills defaults", () => {
  const tool = sampleTool("__valid_tool__");
  assert.equal(tool.timeoutMs, 30_000);
  assert.deepEqual(tool.allowedRoles, ["orchestrator", "swarm_agent"]);
  assert.throws(() => defineTool({ name: "Bad Name", description: "x", parameters: {}, execute: async () => ({ output: "x" }) }));
});

test("registerTool adds a tool and detects duplicates", () => {
  const tool = sampleTool();
  unregisterTool(TEST_TOOL_NAME); // clean slate
  registerTool(tool);
  assert.equal(isToolRegistered(TEST_TOOL_NAME), true);
  assert.equal(toolRegistry.get(TEST_TOOL_NAME)?.name, TEST_TOOL_NAME);

  assert.throws(() => registerTool(sampleTool()), /already registered/);
  assert.equal(toolRegistry.get(TEST_TOOL_NAME)?.name, TEST_TOOL_NAME);

  unregisterTool(TEST_TOOL_NAME);
  assert.equal(isToolRegistered(TEST_TOOL_NAME), false);
});

test("registered plugin tools surface in the OpenAI schema list", async () => {
  const tool = sampleTool(TEST_TOOL_NAME);
  unregisterTool(TEST_TOOL_NAME);
  registerTools([tool]);

  const schemas = toolRegistry.toOpenAISchemas({ agentRole: "orchestrator" });
  const found = schemas.find((s) => s.function.name === TEST_TOOL_NAME);
  assert.ok(found, "expected plugin tool in orchestrator schema list");
  assert.match(found.function.description ?? "", /test plugin tool/);

  // Subagent exclusion still applies.
  unregisterTool(TEST_TOOL_NAME);
});
