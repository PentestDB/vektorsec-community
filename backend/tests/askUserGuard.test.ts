import assert from "node:assert/strict";
import test from "node:test";
import type { ExecutionContext } from "../src/tools/types";
import askUser, { resetAskedQuestions } from "../src/tools/handlers/generic-response";
import { buildSystemPrompt } from "../src/utils/copilot/prompts";
import { buildGuardrailPromptBlock, resolveEffectiveScopeConfig } from "../src/utils/guardrails";

function ctx(sessionId: string): ExecutionContext {
  return { sessionId } as ExecutionContext;
}

test("ask_user delivers a new question as a run-ending ask (exitCode 0)", async () => {
  resetAskedQuestions();
  const result = await askUser.execute(
    { question: "What is the target hostname?" },
    ctx("session-new"),
  );
  assert.equal(result.exitCode, 0);
  assert.equal(result.output, "What is the target hostname?");
});

test("ask_user refuses to ask the same question twice", async () => {
  resetAskedQuestions();
  const session = ctx("session-repeat");
  const question = "Are you the owner of 24hd.media?";

  const first = await askUser.execute({ question }, session);
  // Same question, different casing/whitespace — still a repeat.
  const second = await askUser.execute({ question: `  ${question.toUpperCase()}  ` }, session);

  assert.equal(first.exitCode, 0);
  assert.equal(second.exitCode, 1);
  assert.match(second.output, /ALREADY ASKED/);
  // The refusal must steer the agent back to work instead of another question.
  assert.match(second.output, /Do not ask it again/);
});

test("ask_user still allows a genuinely different follow-up question", async () => {
  resetAskedQuestions();
  const session = ctx("session-followup");
  const first = await askUser.execute({ question: "Which environment is the target?" }, session);
  const second = await askUser.execute({ question: "Which credentials may I use?" }, session);
  assert.equal(first.exitCode, 0);
  assert.equal(second.exitCode, 0);
});

test("ask_user caps the number of questions per session window", async () => {
  resetAskedQuestions();
  const session = ctx("session-cap");
  for (let i = 0; i < 5; i++) {
    const allowed = await askUser.execute({ question: `Distinct question ${i}` }, session);
    assert.equal(allowed.exitCode, 0);
  }
  const overflow = await askUser.execute({ question: "One question too many" }, session);
  assert.equal(overflow.exitCode, 1);
  assert.match(overflow.output, /QUESTION LIMIT REACHED/);
});

test("ask_user rejects an empty question", async () => {
  resetAskedQuestions();
  const result = await askUser.execute({ question: "   " }, ctx("session-empty"));
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /question is required/);
});

test("resetAskedQuestions clears tracked questions", async () => {
  resetAskedQuestions();
  const session = ctx("session-reset");
  await askUser.execute({ question: "Same question" }, session);
  resetAskedQuestions("session-reset");
  const again = await askUser.execute({ question: "Same question" }, session);
  assert.equal(again.exitCode, 0);
});

test("the system prompt forbids negotiating authorization in chat", () => {
  const prompt = buildSystemPrompt({ sessionId: "session-prompt" });
  assert.match(prompt, /<authorization>/);
  assert.match(prompt, /Never ask the user whether they own a target/);
  assert.match(prompt, /Never repeat a question you already asked/);
  assert.match(prompt, /use the ask_user tool once/);
});

test("the guardrails block states the scope list is the given authorization", () => {
  const scope = resolveEffectiveScopeConfig({
    enabled: true,
    strictMode: true,
    entriesRaw: "example.com",
  });
  const block = buildGuardrailPromptBlock({ autonomousMode: true, scope });
  assert.match(block, /IS the operator's authorization/);
  assert.match(block, /never ask the user to confirm it/i);
});
