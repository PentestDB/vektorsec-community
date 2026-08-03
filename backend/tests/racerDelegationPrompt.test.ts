import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../src/utils/copilot/prompts";

test("configured racers are presented as an orchestrator choice", () => {
  const prompt = buildSystemPrompt({
    sessionId: "session-test",
    racerModels: [
      { label: "Racer Codex", provider: "codex-subscription", model: "gpt-5.6-terra" },
    ],
  });

  assert.match(prompt, /You decide whether racers are useful on each turn/);
  assert.match(prompt, /Racer availability is not an instruction to use them/);
  assert.match(prompt, /Respond directly to greetings/);
  assert.match(prompt, /Racer Codex \(codex-subscription\/gpt-5\.6-terra\)/);
});
