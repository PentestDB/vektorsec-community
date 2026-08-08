import axios from "axios";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface CatalogModel {
  id: string;
  modelId: string;
  name: string;
  contextLength: number;
  pricing: { prompt: string; completion: string };
}

export interface CatalogProvider {
  id: string;
  name: string;
  models: CatalogModel[];
}

interface CacheEntry {
  providers: CatalogProvider[];
  timestamp: number;
}

let cache: CacheEntry | null = null;

export const CURATED_PROVIDERS: CatalogProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    models: [
      model("openai/gpt-5.6-sol", "gpt-5.6-sol", "GPT-5.6 Sol", 1_050_000),
      model(
        "openai/gpt-5.6-terra",
        "gpt-5.6-terra",
        "GPT-5.6 Terra",
        1_050_000,
      ),
      model(
        "openai/gpt-5.6-luna",
        "gpt-5.6-luna",
        "GPT-5.6 Luna",
        1_050_000,
      ),
      model("openai/gpt-5.5", "gpt-5.5", "GPT-5.5", 1_000_000),
      model("openai/gpt-5.4", "gpt-5.4", "GPT-5.4", 1_000_000),
      model("openai/gpt-5.4-mini", "gpt-5.4-mini", "GPT-5.4 mini", 400_000),
      model("openai/gpt-5.4-nano", "gpt-5.4-nano", "GPT-5.4 nano", 400_000),
      model("openai/gpt-5.3-codex", "gpt-5.3-codex", "GPT-5.3 Codex", 400_000),
      model(
        "openai/gpt-5.3-codex-spark",
        "gpt-5.3-codex-spark",
        "GPT-5.3 Codex Spark",
        400_000,
      ),
      model("openai/gpt-5.2", "gpt-5.2", "GPT-5.2", 400_000),
      model("openai/gpt-4.1", "gpt-4.1", "GPT-4.1", 1_000_000),
      model("openai/gpt-4.1-mini", "gpt-4.1-mini", "GPT-4.1 mini", 1_000_000),
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    models: [
      model(
        "anthropic/claude-fable-5",
        "claude-fable-5",
        "Claude Fable 5",
        1_000_000,
      ),
      model(
        "anthropic/claude-opus-5",
        "claude-opus-5",
        "Claude Opus 5",
        1_000_000,
      ),
      model(
        "anthropic/claude-sonnet-5",
        "claude-sonnet-5",
        "Claude Sonnet 5",
        1_000_000,
      ),
      model(
        "anthropic/claude-mythos-5",
        "claude-mythos-5",
        "Claude Mythos 5 (limited access)",
        1_000_000,
      ),
      model(
        "anthropic/claude-opus-4-8",
        "claude-opus-4-8",
        "Claude Opus 4.8",
        1_000_000,
      ),
      model(
        "anthropic/claude-opus-4-7",
        "claude-opus-4-7",
        "Claude Opus 4.7",
        1_000_000,
      ),
      model(
        "anthropic/claude-mythos-preview",
        "claude-mythos-preview",
        "Claude Mythos Preview (Project Glasswing)",
        1_000_000,
      ),
      model(
        "anthropic/claude-sonnet-4-6",
        "claude-sonnet-4-6",
        "Claude Sonnet 4.6",
        1_000_000,
      ),
      model(
        "anthropic/claude-haiku-4-5",
        "claude-haiku-4-5",
        "Claude Haiku 4.5",
        200_000,
      ),
      model(
        "anthropic/claude-haiku-4-5-20251001",
        "claude-haiku-4-5-20251001",
        "Claude Haiku 4.5 Snapshot",
        200_000,
      ),
      model(
        "anthropic/claude-opus-4-6",
        "claude-opus-4-6",
        "Claude Opus 4.6",
        1_000_000,
      ),
      model(
        "anthropic/claude-sonnet-4-5",
        "claude-sonnet-4-5",
        "Claude Sonnet 4.5",
        1_000_000,
      ),
    ],
  },
  {
    id: "kimi",
    name: "Kimi (Moonshot AI)",
    models: [
      model("kimi/kimi-k3", "kimi-k3", "Kimi K3", 1_000_000),
      model(
        "kimi/kimi-k2.7-code-highspeed",
        "kimi-k2.7-code-highspeed",
        "Kimi K2.7 Code Highspeed",
        256_000,
      ),
      model(
        "kimi/kimi-k2.7-code",
        "kimi-k2.7-code",
        "Kimi K2.7 Code",
        256_000,
      ),
      model("kimi/kimi-k2.6", "kimi-k2.6", "Kimi K2.6", 256_000),
    ],
  },
  {
    // AWS Bedrock via its OpenAI-compatible endpoint. Only the models Bedrock
    // exposes on that endpoint are listed — each entry below was verified to
    // return a completion. Anthropic and Amazon Nova models are Converse-only
    // and therefore not reachable through this provider.
    //
    // Bedrock does not report context windows, so these are conservative
    // published values: under-declaring only forgoes headroom, whereas
    // over-declaring makes requests fail outright.
    id: "bedrock",
    name: "AWS Bedrock",
    models: [
      model(
        "bedrock/openai.gpt-oss-120b-1:0",
        "openai.gpt-oss-120b-1:0",
        "GPT-OSS 120B",
        128_000,
      ),
      model(
        "bedrock/openai.gpt-oss-20b-1:0",
        "openai.gpt-oss-20b-1:0",
        "GPT-OSS 20B",
        128_000,
      ),
      model(
        "bedrock/qwen.qwen3-coder-next",
        "qwen.qwen3-coder-next",
        "Qwen3 Coder Next",
        128_000,
      ),
      model(
        "bedrock/qwen.qwen3-next-80b-a3b",
        "qwen.qwen3-next-80b-a3b",
        "Qwen3 Next 80B",
        128_000,
      ),
      model(
        "bedrock/moonshotai.kimi-k2.5",
        "moonshotai.kimi-k2.5",
        "Kimi K2.5",
        128_000,
      ),
      model("bedrock/deepseek.v3.2", "deepseek.v3.2", "DeepSeek V3.2", 128_000),
      model(
        "bedrock/mistral.mistral-large-3-675b-instruct",
        "mistral.mistral-large-3-675b-instruct",
        "Mistral Large 3",
        128_000,
      ),
      model(
        "bedrock/mistral.devstral-2-123b",
        "mistral.devstral-2-123b",
        "Devstral 2 123B",
        128_000,
      ),
      model(
        "bedrock/minimax.minimax-m2.5",
        "minimax.minimax-m2.5",
        "MiniMax M2.5",
        128_000,
      ),
      model("bedrock/zai.glm-5", "zai.glm-5", "GLM-5", 128_000),
      model("bedrock/zai.glm-4.7", "zai.glm-4.7", "GLM-4.7", 128_000),
    ],
  },
  {
    id: "codex-subscription",
    name: "Codex Subscription (local CLI)",
    models: [
      model(
        "codex-subscription/gpt-5.6-sol",
        "gpt-5.6-sol",
        "GPT-5.6 Sol via Codex",
        1_050_000,
      ),
      model(
        "codex-subscription/gpt-5.6-terra",
        "gpt-5.6-terra",
        "GPT-5.6 Terra via Codex",
        1_050_000,
      ),
      model(
        "codex-subscription/gpt-5.6-luna",
        "gpt-5.6-luna",
        "GPT-5.6 Luna via Codex",
        1_050_000,
      ),
    ],
  },
  {
    id: "claude-subscription",
    name: "Claude Subscription (local CLI)",
    models: [
      model(
        "claude-subscription/claude-fable-5",
        "claude-fable-5",
        "Claude Fable 5 via Claude Code",
        1_000_000,
      ),
      model(
        "claude-subscription/claude-opus-5",
        "claude-opus-5",
        "Claude Opus 5 via Claude Code",
        1_000_000,
      ),
      model(
        "claude-subscription/claude-sonnet-5",
        "claude-sonnet-5",
        "Claude Sonnet 5 via Claude Code",
        1_000_000,
      ),
    ],
  },
  {
    // MiniMax speaks the Anthropic Messages API, so these route through the
    // Anthropic client path with the MiniMax base URL applied automatically.
    // The same models remain listed under "Anthropic-Compatible" for anyone
    // pointing at a self-hosted or proxied endpoint.
    id: "minimax",
    name: "MiniMax",
    models: [
      model("minimax/MiniMax-M2.7", "MiniMax-M2.7", "MiniMax M2.7", 204_800),
      model(
        "minimax/MiniMax-M2.7-highspeed",
        "MiniMax-M2.7-highspeed",
        "MiniMax M2.7 highspeed",
        204_800,
      ),
      model("minimax/MiniMax-M2.5", "MiniMax-M2.5", "MiniMax M2.5", 204_800),
      model(
        "minimax/MiniMax-M2.5-highspeed",
        "MiniMax-M2.5-highspeed",
        "MiniMax M2.5 highspeed",
        204_800,
      ),
      model("minimax/MiniMax-M2.1", "MiniMax-M2.1", "MiniMax M2.1", 204_800),
      model(
        "minimax/MiniMax-M2.1-highspeed",
        "MiniMax-M2.1-highspeed",
        "MiniMax M2.1 highspeed",
        204_800,
      ),
      model("minimax/MiniMax-M2", "MiniMax-M2", "MiniMax M2", 204_800),
    ],
  },
  {
    id: "anthropic-compatible",
    name: "Anthropic-Compatible",
    models: [
      model(
        "anthropic-compatible/MiniMax-M2.7",
        "MiniMax-M2.7",
        "MiniMax M2.7",
        204_800,
      ),
      model(
        "anthropic-compatible/MiniMax-M2.7-highspeed",
        "MiniMax-M2.7-highspeed",
        "MiniMax M2.7 highspeed",
        204_800,
      ),
      model(
        "anthropic-compatible/MiniMax-M2.5",
        "MiniMax-M2.5",
        "MiniMax M2.5",
        204_800,
      ),
      model(
        "anthropic-compatible/MiniMax-M2.5-highspeed",
        "MiniMax-M2.5-highspeed",
        "MiniMax M2.5 highspeed",
        204_800,
      ),
      model(
        "anthropic-compatible/MiniMax-M2.1",
        "MiniMax-M2.1",
        "MiniMax M2.1",
        204_800,
      ),
      model(
        "anthropic-compatible/MiniMax-M2.1-highspeed",
        "MiniMax-M2.1-highspeed",
        "MiniMax M2.1 highspeed",
        204_800,
      ),
      model(
        "anthropic-compatible/MiniMax-M2",
        "MiniMax-M2",
        "MiniMax M2",
        204_800,
      ),
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    models: [
      model(
        "openrouter/moonshotai/kimi-k3",
        "moonshotai/kimi-k3",
        "Kimi K3 via OpenRouter",
        1_000_000,
      ),
      model(
        "openrouter/minimax/minimax-m2.7",
        "minimax/minimax-m2.7",
        "MiniMax M2.7 via OpenRouter",
        204_800,
      ),
      model(
        "openrouter/minimax/minimax-m2.7-highspeed",
        "minimax/minimax-m2.7-highspeed",
        "MiniMax M2.7 highspeed via OpenRouter",
        204_800,
      ),
      model(
        "openrouter/anthropic/claude-opus-5",
        "anthropic/claude-opus-5",
        "Claude Opus 5 via OpenRouter",
        1_000_000,
      ),
      model(
        "openrouter/anthropic/claude-sonnet-5",
        "anthropic/claude-sonnet-5",
        "Claude Sonnet 5 via OpenRouter",
        1_000_000,
      ),
      model(
        "openrouter/openai/gpt-5.6-sol",
        "openai/gpt-5.6-sol",
        "GPT-5.6 Sol via OpenRouter",
        1_050_000,
      ),
      model(
        "openrouter/openai/gpt-5.6-terra",
        "openai/gpt-5.6-terra",
        "GPT-5.6 Terra via OpenRouter",
        1_050_000,
      ),
      model(
        "openrouter/anthropic/claude-opus-4.7",
        "anthropic/claude-opus-4.7",
        "Claude Opus 4.7 via OpenRouter",
        1_000_000,
      ),
      model(
        "openrouter/anthropic/claude-mythos-preview",
        "anthropic/claude-mythos-preview",
        "Claude Mythos Preview via OpenRouter",
        1_000_000,
      ),
      model(
        "openrouter/anthropic/claude-sonnet-4.6",
        "anthropic/claude-sonnet-4.6",
        "Claude Sonnet 4.6 via OpenRouter",
        1_000_000,
      ),
      model(
        "openrouter/openai/gpt-5.5",
        "openai/gpt-5.5",
        "GPT-5.5 via OpenRouter",
        1_000_000,
      ),
      model(
        "openrouter/openai/gpt-5.4",
        "openai/gpt-5.4",
        "GPT-5.4 via OpenRouter",
        1_000_000,
      ),
    ],
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    models: [
      model("ollama/llama3.3", "llama3.3", "Llama 3.3", 128_000),
      model("ollama/llama3.2", "llama3.2", "Llama 3.2", 128_000),
      model("ollama/llama3.1", "llama3.1", "Llama 3.1", 128_000),
      model("ollama/qwen2.5-coder", "qwen2.5-coder", "Qwen2.5 Coder", 32_768),
      model("ollama/qwen2.5", "qwen2.5", "Qwen2.5", 32_768),
      model("ollama/mistral", "mistral", "Mistral 7B", 32_768),
      model("ollama/mixtral", "mixtral", "Mixtral 8x7B", 32_768),
      model("ollama/codellama", "codellama", "Code Llama", 16_384),
      model("ollama/deepseek-r1", "deepseek-r1", "DeepSeek R1", 65_536),
      model("ollama/gpt-oss", "gpt-oss", "GPT-OSS", 131_072),
      model("ollama/phi4", "phi4", "Phi-4", 16_384),
      model("ollama/gemma3", "gemma3", "Gemma 3", 128_000),
    ],
  },
];

function model(
  id: string,
  modelId: string,
  name: string,
  contextLength: number,
): CatalogModel {
  return {
    id,
    modelId,
    name,
    contextLength,
    pricing: { prompt: "0", completion: "0" },
  };
}

function transformModels(raw: any[]): CatalogProvider[] {
  const models = raw
    .filter((m) => typeof m?.id === "string" && m.id.includes("/"))
    .map((m) => ({
      id: `openrouter/${m.id}`,
      modelId: m.id,
      name: m.name ?? m.id,
      contextLength: m.context_length ?? 0,
      pricing: {
        prompt: m.pricing?.prompt ?? "0",
        completion: m.pricing?.completion ?? "0",
      },
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return [{ id: "openrouter", name: "OpenRouter", models }];
}

function mergeCuratedProviders(
  providers: CatalogProvider[],
): CatalogProvider[] {
  const merged = new Map<string, CatalogProvider>();

  for (const provider of providers) {
    merged.set(provider.id, {
      ...provider,
      models: [...provider.models],
    });
  }

  for (const curated of CURATED_PROVIDERS) {
    const existing = merged.get(curated.id);
    if (!existing) {
      merged.set(curated.id, {
        ...curated,
        models: [...curated.models],
      });
      continue;
    }

    const seen = new Set(existing.models.map((m) => m.modelId));
    existing.name = curated.name;
    existing.models = [
      ...curated.models,
      ...existing.models.filter((m) => {
        if (
          seen.has(m.modelId) &&
          curated.models.some((cm) => cm.modelId === m.modelId)
        ) {
          return false;
        }
        return !curated.models.some((cm) => cm.modelId === m.modelId);
      }),
    ];
  }

  return Array.from(merged.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export async function getAvailableModels(): Promise<CatalogProvider[]> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return cache.providers;
  }

  try {
    const res = await axios.get(OPENROUTER_MODELS_URL, { timeout: 15_000 });
    const providers = mergeCuratedProviders(
      transformModels(res.data?.data ?? []),
    );
    cache = { providers, timestamp: Date.now() };
    return providers;
  } catch (err: any) {
    console.error(
      "[models-catalog] Failed to fetch OpenRouter models:",
      err.message,
    );
    if (cache) return cache.providers;
    return mergeCuratedProviders([]);
  }
}
