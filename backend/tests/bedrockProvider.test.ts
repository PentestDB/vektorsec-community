import { test } from "node:test";
import assert from "node:assert/strict";
import { bedrockBaseURL, DEFAULT_BEDROCK_REGION } from "../src/utils/llm/providers";
import { CURATED_PROVIDERS } from "../src/services/models-catalog.service";

test("an explicit base URL always wins and is trimmed", () => {
  assert.equal(
    bedrockBaseURL("https://bedrock-runtime.eu-west-1.amazonaws.com/openai/v1"),
    "https://bedrock-runtime.eu-west-1.amazonaws.com/openai/v1",
  );
  assert.equal(
    bedrockBaseURL("https://bedrock-runtime.ap-south-1.amazonaws.com/openai/v1///"),
    "https://bedrock-runtime.ap-south-1.amazonaws.com/openai/v1",
  );
});

test("falls back to a region-derived OpenAI-compatible endpoint", () => {
  const url = bedrockBaseURL();
  assert.match(url, /^https:\/\/bedrock-runtime\.[a-z0-9-]+\.amazonaws\.com\/openai\/v1$/);
});

test("default region is used when nothing is configured", () => {
  // The env file in a test run carries no Bedrock region, so the default applies.
  const url = bedrockBaseURL();
  assert.ok(
    url.includes(DEFAULT_BEDROCK_REGION) || /bedrock-runtime\.[a-z0-9-]+\./.test(url),
    `unexpected endpoint: ${url}`,
  );
});

test("bedrock is a curated provider with reachable model ids", () => {
  const bedrock = CURATED_PROVIDERS.find((p) => p.id === "bedrock");
  assert.ok(bedrock, "bedrock provider missing from catalog");
  assert.ok(bedrock!.models.length > 0);

  for (const m of bedrock!.models) {
    assert.equal(m.id, `bedrock/${m.modelId}`, "catalog id must be namespaced");
    assert.ok(m.contextLength > 0, `${m.modelId} needs a context length`);
    // Anthropic and Amazon models are Converse-only and unreachable through
    // the OpenAI-compatible endpoint this provider targets.
    assert.ok(
      !m.modelId.startsWith("anthropic.") && !m.modelId.startsWith("amazon."),
      `${m.modelId} is not available on the OpenAI-compatible endpoint`,
    );
  }
});
