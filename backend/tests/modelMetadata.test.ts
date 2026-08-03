import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getModelContextLimit,
  normalizeModelId,
} from "../src/utils/modelMetadata";
import { CURATED_PROVIDERS } from "../src/services/models-catalog.service";

test("context resolution uses the most specific model id", () => {
  assert.equal(getModelContextLimit("gpt-5.4-mini"), 400_000);
  assert.equal(getModelContextLimit("openai/gpt-5.4-nano"), 400_000);
  assert.equal(getModelContextLimit("gpt-5.4"), 1_000_000);
});

test("latest model families have current context limits and aliases", () => {
  assert.equal(normalizeModelId("gpt-5.6"), "gpt-5.6-sol");
  assert.equal(normalizeModelId("claude-opus-5-latest"), "claude-opus-5");
  assert.equal(normalizeModelId("kimi-k3-latest"), "kimi-k3");
  assert.equal(getModelContextLimit("gpt-5.6-terra"), 1_050_000);
  assert.equal(getModelContextLimit("claude-opus-5"), 1_000_000);
  assert.equal(getModelContextLimit("kimi-k3"), 1_000_000);
});

test("curated roster includes current API and subscription lineages", () => {
  const roster = new Set(
    CURATED_PROVIDERS.flatMap((provider) =>
      provider.models.map((model) => `${provider.id}:${model.modelId}`),
    ),
  );
  for (const expected of [
    "openai:gpt-5.6-sol",
    "openai:gpt-5.6-terra",
    "openai:gpt-5.6-luna",
    "anthropic:claude-fable-5",
    "anthropic:claude-opus-5",
    "anthropic:claude-sonnet-5",
    "kimi:kimi-k3",
    "codex-subscription:gpt-5.6-terra",
    "claude-subscription:claude-opus-5",
    "openrouter:moonshotai/kimi-k3",
  ]) {
    assert.equal(roster.has(expected), true, `missing ${expected}`);
  }
});
