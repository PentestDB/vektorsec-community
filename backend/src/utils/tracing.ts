/**
 * Langfuse tracing initialization.
 * Must be called before any LLM calls. Reads config from process.env (set by loadConfig from config.toml).
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { AnthropicInstrumentation } from "@arizeai/openinference-instrumentation-anthropic";
import Anthropic from "@anthropic-ai/sdk";

let _initialized = false;

export function isTracingEnabled(): boolean {
  const enabled = process.env.LANGFUSE_ENABLED;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  return enabled === "true" && !!publicKey && !!secretKey;
}

export function initTracing(): void {
  if (_initialized) return;
  if (!isTracingEnabled()) return;

  try {
    const anthropicInstrumentation = new AnthropicInstrumentation();
    anthropicInstrumentation.manuallyInstrument(Anthropic);

    const sdk = new NodeSDK({
      spanProcessors: [new LangfuseSpanProcessor()],
      instrumentations: [anthropicInstrumentation],
    });
    sdk.start();
    _initialized = true;
    console.log("[tracing] Langfuse enabled — LLM traces will be sent");
  } catch (err) {
    console.warn("[tracing] Failed to initialize Langfuse:", err);
  }
}
