import { ToolDefinition } from "../types";

/**
 * `ask_user` is the agent's only way to pause a run and hand the turn back to
 * the operator, so a repeated question is not just noise — it stalls the whole
 * engagement (the run ends on every ask and the model re-asks next turn).
 *
 * The classic offender is the authorization loop ("is this target yours? do
 * you have written permission?"): the workspace scope allowlist already answers
 * that once, so the agent must never negotiate it in chat.
 *
 * Guard rules (per session, in-process):
 *   - an identical question is refused with exitCode 1, so
 *     agent.service only ends the run for a genuinely new question;
 *   - a volume cap keeps a session from turning into an interrogation.
 */
const ASK_WINDOW_MS = 30 * 60 * 1000;
const MAX_QUESTIONS_PER_WINDOW = 5;

const askedQuestions = new Map<string, Map<string, number>>();

function normalizeQuestion(question: string): string {
  return question.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 300);
}

function sessionQuestions(sessionId: string, now: number): Map<string, number> {
  let session = askedQuestions.get(sessionId);
  if (!session) {
    session = new Map();
    askedQuestions.set(sessionId, session);
  }
  for (const [key, askedAt] of session) {
    if (now - askedAt > ASK_WINDOW_MS) session.delete(key);
  }
  if (session.size === 0 && askedQuestions.size > 500) {
    // Keep the map from growing without bound on long-lived processes.
    askedQuestions.delete(sessionId);
  }
  return session;
}

/** Test helper: forget the questions tracked for a session (or all of them). */
export function resetAskedQuestions(sessionId?: string): void {
  if (sessionId === undefined) askedQuestions.clear();
  else askedQuestions.delete(sessionId);
}

const genericResponse: ToolDefinition = {
  name: "ask_user",
  description:
    "Ask the user a question or request specific information needed to continue. " +
    "Use this only for information that is genuinely missing and that only the user " +
    "can provide (target details, credentials, file contents) — never to ask for " +
    "permission to run commands, and never to ask whether the user owns or is " +
    "authorized to test a target (the workspace scope allowlist is the authorization). " +
    "Asking the same question twice is refused by the platform.",
  parameters: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "The question or request for the user",
      },
    },
    required: ["question"],
  },
  timeoutMs: 0,
  async execute(args, ctx) {
    const question = typeof args.question === "string" ? args.question.trim() : "";
    if (!question) {
      return { output: "Error: question is required", exitCode: 1 };
    }

    const now = Date.now();
    const session = sessionQuestions(ctx.sessionId, now);
    const key = normalizeQuestion(question);

    if (session.has(key)) {
      return {
        output:
          "ALREADY ASKED: you asked this question earlier in this session and the user " +
          "already answered it. Do not ask it again and do not restate it as prose. " +
          "Continue with the work you can do now, or state clearly what is blocked and finish.",
        exitCode: 1,
      };
    }

    if (session.size >= MAX_QUESTIONS_PER_WINDOW) {
      return {
        output:
          `QUESTION LIMIT REACHED: ${MAX_QUESTIONS_PER_WINDOW} questions were already asked in this ` +
          "session. Do not ask for more input. Proceed with the best assumption you can justify and " +
          "report exactly what you assumed, or state what is blocked and finish.",
        exitCode: 1,
      };
    }

    session.set(key, now);
    return { output: question, exitCode: 0 };
  },
};

export default genericResponse;
