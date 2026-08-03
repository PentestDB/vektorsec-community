import { test } from "node:test";
import assert from "node:assert/strict";
import updateEngagementState from "../src/tools/handlers/update-engagement-state";
import { EngagementState } from "../src/services/engagement-state";

function context(state: EngagementState): any {
  return {
    sessionId: "test-session",
    agentId: "test-agent",
    agentRole: "orchestrator",
    engagementState: state,
  };
}

test("add_key_discovery records titled discoveries from title and description", async () => {
  const state = new EngagementState("ctf");
  const result = await updateEngagementState.execute(
    {
      action: "add_key_discovery",
      data: {
        title: "SSH private key",
        description: "Found in the backup archive under /home/ctf/.ssh.",
      },
    },
    context(state),
  );

  assert.equal(result.exitCode, 0);
  assert.deepEqual(state.keyDiscoveries, [
    "SSH private key: Found in the backup archive under /home/ctf/.ssh.",
  ]);
  assert.match(result.output, /SSH private key/);
});

test("add_key_discovery preserves legacy discovery/value payloads", async () => {
  const state = new EngagementState("ctf");
  await updateEngagementState.execute(
    { action: "add_key_discovery", data: { discovery: "Recovered flag" } },
    context(state),
  );
  await updateEngagementState.execute(
    { action: "add_key_discovery", data: { value: "Interesting config" } },
    context(state),
  );

  assert.deepEqual(state.keyDiscoveries, ["Recovered flag", "Interesting config"]);
});

test("add_key_discovery rejects empty payloads instead of recording a placeholder", async () => {
  const state = new EngagementState("ctf");
  const result = await updateEngagementState.execute(
    { action: "add_key_discovery", data: {} },
    context(state),
  );

  assert.equal(result.exitCode, 1);
  assert.match(result.output, /requires data\.title or data\.description/);
  assert.deepEqual(state.keyDiscoveries, []);
});

test("update_engagement_state schema documents key discovery fields", () => {
  const properties = (updateEngagementState.parameters as any).properties.data.properties;
  assert.equal(properties.title.type, "string");
  assert.equal(properties.description.type, "string");
  assert.equal(properties.discovery.type, "string");
  assert.equal(properties.value.type, "string");
});
