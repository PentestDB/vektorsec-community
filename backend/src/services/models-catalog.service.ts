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

function titleCase(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function transformModels(raw: any[]): CatalogProvider[] {
  const grouped = new Map<string, { name: string; models: CatalogModel[] }>();

  for (const m of raw) {
    const id: string = m.id ?? "";
    const slashIdx = id.indexOf("/");
    if (slashIdx === -1) continue;

    const providerId = id.slice(0, slashIdx);
    const modelId = id.slice(slashIdx + 1);

    if (!grouped.has(providerId)) {
      grouped.set(providerId, { name: titleCase(providerId), models: [] });
    }

    grouped.get(providerId)!.models.push({
      id,
      modelId,
      name: m.name ?? modelId,
      contextLength: m.context_length ?? 0,
      pricing: {
        prompt: m.pricing?.prompt ?? "0",
        completion: m.pricing?.completion ?? "0",
      },
    });
  }

  // Sort providers alphabetically, models by name within each provider
  const providers = Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, data]) => ({
      id,
      name: data.name,
      models: data.models.sort((a, b) => a.name.localeCompare(b.name)),
    }));

  return providers;
}

export async function getAvailableModels(): Promise<CatalogProvider[]> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return cache.providers;
  }

  try {
    const res = await axios.get(OPENROUTER_MODELS_URL, { timeout: 15_000 });
    const providers = transformModels(res.data?.data ?? []);
    cache = { providers, timestamp: Date.now() };
    return providers;
  } catch (err: any) {
    console.error("[models-catalog] Failed to fetch OpenRouter models:", err.message);
    if (cache) return cache.providers;
    return [];
  }
}
