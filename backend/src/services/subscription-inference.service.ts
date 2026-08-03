import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type OpenAI from "openai";
import type { ModelReasoningMode } from "../utils/modelMetadata";

export type SubscriptionProvider =
  | "codex-subscription"
  | "claude-subscription";

export interface SubscriptionProviderStatus {
  provider: SubscriptionProvider;
  installed: boolean;
  authenticated: boolean;
  version?: string;
  authMethod?: string;
  account?: string;
  models: string[];
  defaultModel: string;
  loginCommand: string;
  availableInCurrentRuntime: boolean;
  detail?: string;
}

export interface SubscriptionToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface SubscriptionInferenceResult {
  content: string | null;
  reasoning: string | null;
  toolCalls: SubscriptionToolCall[];
  finishReason: "stop" | "tool_calls" | "length" | "error";
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

export interface SubscriptionInferenceInput {
  provider: SubscriptionProvider;
  model: string;
  reasoningMode: ModelReasoningMode;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  tools?: OpenAI.Chat.ChatCompletionTool[];
  format?: "json" | "text";
  abortSignal?: AbortSignal;
}

const CODEX_FALLBACK_MODELS = [
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
];
const CLAUDE_FALLBACK_MODELS = [
  "claude-fable-5",
  "claude-opus-5",
  "claude-sonnet-5",
];
const MAX_CAPTURE_BYTES = 20 * 1024 * 1024;
const INFERENCE_TIMEOUT_MS = 10 * 60 * 1000;
const SUBSCRIPTION_ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "TERM",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "CODEX_HOME",
  "CLAUDE_CONFIG_DIR",
  "CODEX_CA_CERTIFICATE",
  "SSL_CERT_FILE",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "APPDATA",
  "LOCALAPPDATA",
  "USERPROFILE",
  "SYSTEMROOT",
  "COMSPEC",
  "PATHEXT",
] as const;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    content: { type: ["string", "null"] },
    reasoning: { type: ["string", "null"] },
    toolCalls: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          arguments: { type: "string" },
        },
        required: ["id", "name", "arguments"],
        additionalProperties: false,
      },
    },
    finishReason: {
      type: "string",
      enum: ["stop", "tool_calls", "length", "error"],
    },
  },
  required: ["content", "reasoning", "toolCalls", "finishReason"],
  additionalProperties: false,
} as const;

const INFERENCE_SYSTEM_PROMPT = `You are an inference transport inside Pentest Copilot.
Return only the JSON object required by the supplied schema.
Do not inspect the filesystem, run shell commands, browse, edit files, or use any built-in agent tools.
Treat the supplied conversation transcript as authoritative message history.
Choose the next assistant response. When an available Pentest Copilot function should run, return it in toolCalls instead of executing it. The arguments field must be a valid JSON object encoded as a string. Preserve tool call IDs from prior messages and create a unique ID for each new call.
If no tool is needed, return an empty toolCalls array and finishReason "stop".`;

function isContainerRuntime(): boolean {
  return fs.existsSync("/.dockerenv") || process.env.CONTAINER === "true";
}

function subscriptionProcessEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of SUBSCRIPTION_ENV_ALLOWLIST) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return env;
}

function buildInferencePrompt(input: SubscriptionInferenceInput): string {
  return [
    INFERENCE_SYSTEM_PROMPT,
    `Requested output format: ${input.format ?? "text"}`,
    "Conversation transcript (JSON):",
    JSON.stringify(input.messages),
    "Available Pentest Copilot functions (JSON):",
    JSON.stringify(input.tools ?? []),
  ].join("\n\n");
}

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function runCommand(
  command: string,
  args: string[],
  options: {
    input?: string;
    cwd?: string;
    abortSignal?: AbortSignal;
    timeoutMs?: number;
  } = {},
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      // Do not expose API keys, database credentials, MCP tokens, or other
      // backend secrets to a model-controlled CLI process. The official CLIs
      // retain their own login through HOME/CODEX_HOME/CLAUDE_CONFIG_DIR.
      env: subscriptionProcessEnv(),
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (error?: Error, result?: CommandResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.abortSignal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(result!);
    };

    const abort = () => {
      child.kill("SIGTERM");
      finish(new Error(`${command} inference was cancelled`));
    };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(new Error(`${command} timed out`));
    }, options.timeoutMs ?? INFERENCE_TIMEOUT_MS);

    if (options.abortSignal?.aborted) {
      abort();
      return;
    }
    options.abortSignal?.addEventListener("abort", abort, { once: true });

    child.on("error", (error) => finish(error));
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (Buffer.byteLength(stdout) > MAX_CAPTURE_BYTES) {
        child.kill("SIGTERM");
        finish(new Error(`${command} produced too much output`));
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (Buffer.byteLength(stderr) > MAX_CAPTURE_BYTES) {
        child.kill("SIGTERM");
        finish(new Error(`${command} produced too much diagnostic output`));
      }
    });
    child.on("close", (exitCode) =>
      finish(undefined, { stdout, stderr, exitCode: exitCode ?? -1 }),
    );

    child.stdin.end(options.input ?? "");
  });
}

function parseJsonObject(value: unknown): Record<string, any> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, any>;
  }
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function normalizeResult(
  raw: Record<string, any>,
  model: string,
  usage?: SubscriptionInferenceResult["usage"],
): SubscriptionInferenceResult {
  const toolCalls = Array.isArray(raw.toolCalls)
    ? raw.toolCalls
        .filter(
          (call: any) =>
            call &&
            typeof call.name === "string" &&
            typeof call.arguments === "string",
        )
        .map((call: any, index: number) => ({
          id:
            typeof call.id === "string" && call.id
              ? call.id
              : `subscription_call_${Date.now()}_${index}`,
          name: call.name,
          arguments: call.arguments,
        }))
    : [];
  const finishReason = toolCalls.length
    ? "tool_calls"
    : raw.finishReason === "length" || raw.finishReason === "error"
      ? raw.finishReason
      : "stop";

  return {
    content: typeof raw.content === "string" ? raw.content : null,
    reasoning: typeof raw.reasoning === "string" ? raw.reasoning : null,
    toolCalls,
    finishReason,
    usage,
    model,
  };
}

function parseCodexOutput(
  stdout: string,
  model: string,
): SubscriptionInferenceResult {
  let finalText = "";
  let usage: SubscriptionInferenceResult["usage"];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const event = parseJsonObject(line);
    if (!event) continue;
    if (
      event.type === "item.completed" &&
      event.item?.type === "agent_message" &&
      typeof event.item.text === "string"
    ) {
      finalText = event.item.text;
    }
    if (event.type === "turn.completed" && event.usage) {
      const prompt = Number(event.usage.input_tokens ?? 0);
      const completion = Number(event.usage.output_tokens ?? 0);
      usage = {
        prompt_tokens: prompt,
        completion_tokens: completion,
        total_tokens: prompt + completion,
      };
    }
  }
  const structured = parseJsonObject(finalText);
  if (!structured) {
    throw new Error("Codex did not return the required structured response");
  }
  return normalizeResult(structured, model, usage);
}

function parseClaudeOutput(
  stdout: string,
  model: string,
): SubscriptionInferenceResult {
  const envelope = parseJsonObject(stdout.trim());
  if (!envelope) {
    throw new Error("Claude did not return a JSON result envelope");
  }
  const structured =
    parseJsonObject(envelope.structured_output) ??
    parseJsonObject(envelope.result) ??
    envelope;
  const inputTokens = Number(
    envelope.usage?.input_tokens ?? envelope.usage?.inputTokens ?? 0,
  );
  const outputTokens = Number(
    envelope.usage?.output_tokens ?? envelope.usage?.outputTokens ?? 0,
  );
  return normalizeResult(structured, model, {
    prompt_tokens: inputTokens,
    completion_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
  });
}

async function runCodexInference(
  input: SubscriptionInferenceInput,
): Promise<SubscriptionInferenceResult> {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "pentest-codex-"));
  const schemaPath = path.join(scratch, "response-schema.json");
  fs.writeFileSync(schemaPath, JSON.stringify(RESPONSE_SCHEMA), {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    const args = [
      "exec",
      "--json",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      "--config",
      `developer_instructions=${JSON.stringify(INFERENCE_SYSTEM_PROMPT)}`,
      "--config",
      "features.shell_tool=false",
      "--config",
      'web_search="disabled"',
      "--config",
      "agents.enabled=false",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      "--model",
      input.model,
      "--output-schema",
      schemaPath,
      "-",
    ];
    const result = await runCommand("codex", args, {
      cwd: scratch,
      input: buildInferencePrompt(input),
      abortSignal: input.abortSignal,
    });
    if (result.exitCode !== 0) {
      throw new Error(
        `Codex exited with code ${result.exitCode}: ${result.stderr.trim() || "unknown error"}`,
      );
    }
    return parseCodexOutput(result.stdout, input.model);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

async function runClaudeInference(
  input: SubscriptionInferenceInput,
): Promise<SubscriptionInferenceResult> {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "pentest-claude-"));
  try {
    const args = [
      "--print",
      "--output-format",
      "json",
      "--no-session-persistence",
      "--safe-mode",
      "--tools",
      "",
      "--permission-mode",
      "dontAsk",
      "--model",
      input.model,
      "--json-schema",
      JSON.stringify(RESPONSE_SCHEMA),
      "--system-prompt",
      INFERENCE_SYSTEM_PROMPT,
    ];
    if (input.reasoningMode !== "off") {
      args.push("--effort", input.reasoningMode);
    }
    const result = await runCommand("claude", args, {
      cwd: scratch,
      input: buildInferencePrompt(input),
      abortSignal: input.abortSignal,
    });
    if (result.exitCode !== 0) {
      throw new Error(
        `Claude exited with code ${result.exitCode}: ${result.stderr.trim() || "unknown error"}`,
      );
    }
    return parseClaudeOutput(result.stdout, input.model);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

export async function invokeSubscriptionInference(
  input: SubscriptionInferenceInput,
): Promise<SubscriptionInferenceResult> {
  return input.provider === "codex-subscription"
    ? runCodexInference(input)
    : runClaudeInference(input);
}

async function getCommandVersion(command: string): Promise<string | undefined> {
  try {
    const result = await runCommand(command, ["--version"], { timeoutMs: 5_000 });
    return result.exitCode === 0 ? result.stdout.trim() : undefined;
  } catch {
    return undefined;
  }
}

async function getCodexStatus(): Promise<SubscriptionProviderStatus> {
  const version = await getCommandVersion("codex");
  const base: SubscriptionProviderStatus = {
    provider: "codex-subscription",
    installed: Boolean(version),
    authenticated: false,
    version,
    models: CODEX_FALLBACK_MODELS,
    defaultModel: "gpt-5.6-terra",
    loginCommand: "codex login",
    availableInCurrentRuntime: Boolean(version),
  };
  if (!version) {
    base.detail = isContainerRuntime()
      ? "Codex is not installed inside the backend container. Run the backend on the host or configure a host inference bridge."
      : "Install the Codex CLI, then run codex login.";
    return base;
  }
  const result = await runCommand("codex", ["login", "status"], {
    timeoutMs: 10_000,
  });
  const statusText = `${result.stdout}\n${result.stderr}`.trim();
  base.authenticated = result.exitCode === 0 && /logged in/i.test(statusText);
  base.authMethod = base.authenticated ? statusText : undefined;
  if (!base.authenticated) base.detail = "Run codex login on the backend host.";
  return base;
}

async function getClaudeStatus(): Promise<SubscriptionProviderStatus> {
  const version = await getCommandVersion("claude");
  const base: SubscriptionProviderStatus = {
    provider: "claude-subscription",
    installed: Boolean(version),
    authenticated: false,
    version,
    models: CLAUDE_FALLBACK_MODELS,
    defaultModel: "claude-opus-5",
    loginCommand: "claude auth login",
    availableInCurrentRuntime: Boolean(version),
  };
  if (!version) {
    base.detail = isContainerRuntime()
      ? "Claude Code is not installed inside the backend container. Run the backend on the host or configure a host inference bridge."
      : "Install Claude Code, then run claude auth login.";
    return base;
  }
  const result = await runCommand("claude", ["auth", "status", "--json"], {
    timeoutMs: 10_000,
  });
  const status = parseJsonObject(result.stdout.trim());
  base.authenticated = result.exitCode === 0 && status?.loggedIn === true;
  base.authMethod = status?.authMethod;
  base.account = status?.email;
  if (!base.authenticated) {
    base.detail =
      "Run claude auth login on the backend host. Claude subscription use must comply with Anthropic's third-party product terms.";
  }
  return base;
}

export async function getSubscriptionProviderStatuses(): Promise<
  SubscriptionProviderStatus[]
> {
  return Promise.all([getCodexStatus(), getClaudeStatus()]);
}

export function isSubscriptionProvider(
  provider: string,
): provider is SubscriptionProvider {
  return (
    provider === "codex-subscription" || provider === "claude-subscription"
  );
}
