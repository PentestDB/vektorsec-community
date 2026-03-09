/**
 * Langfuse tracing initialization.
 * Must be called before any LLM calls. Reads config from process.env (set by loadConfig from config.toml).
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";

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
    const sdk = new NodeSDK({
      spanProcessors: [new LangfuseSpanProcessor()],
    });
    sdk.start();
    _initialized = true;
    console.log("[tracing] Langfuse enabled — LLM traces will be sent");
  } catch (err) {
    console.warn("[tracing] Failed to initialize Langfuse:", err);
  }
}
