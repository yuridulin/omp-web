import { z } from "zod";
import { json } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import {
  flattenModelsDevCatalog,
  recommendModelCatalogPreset,
  searchModelCatalog,
  type ModelCatalogEntry,
} from "@/lib/model-catalog";

const catalogCostSchema = z.looseObject({
  input: z.number().optional(),
  output: z.number().optional(),
  cacheRead: z.number().optional(),
  cacheWrite: z.number().optional(),
});

const catalogEntrySchema = z.looseObject({
  key: z.string(),
  providerId: z.string(),
  providerName: z.string(),
  providerBaseUrl: z.string().optional(),
  id: z.string(),
  name: z.string(),
  reasoning: z.boolean().optional(),
  input: z.array(z.string()).optional(),
  contextWindow: z.number().optional(),
  maxTokens: z.number().optional(),
  cost: catalogCostSchema,
});

const catalogRecommendationSchema = z.looseObject({
  exactMatches: z.number(),
  metadataMethod: z.enum(["provider", "base-url", "consensus", "none"]),
  matchedProviderId: z.string().optional(),
  matchedProviderName: z.string().optional(),
  preset: z.looseObject({
    name: z.string().optional(),
    reasoning: z.boolean().optional(),
    input: z.array(z.string()).optional(),
    contextWindow: z.number().optional(),
    maxTokens: z.number().optional(),
    cost: catalogCostSchema.optional(),
  }),
  price: z.looseObject({
    status: z.enum(["reliable", "unreliable"]),
    reason: z.string().optional(),
    method: z.string().optional(),
    cost: catalogCostSchema.optional(),
    providerId: z.string().optional(),
    providerName: z.string().optional(),
    support: z.number().optional(),
    total: z.number().optional(),
  }),
});

export const contract = routeContract({
  GET: {
    summary: "Search the models.dev catalog and recommend an add-model preset",
    request: {
      query: z.object({
        q: z.string().optional(),
        provider: z.string().optional(),
        baseUrl: z.string().optional(),
        limit: z.string().optional(),
      }),
    },
    responses: {
      200: z.looseObject({
        models: z.array(catalogEntrySchema),
        recommendation: catalogRecommendationSchema,
        source: z.string(),
      }),
      502: errorEnvelope,
    },
  },
});

const MODELS_DEV_URL = "https://models.dev/api.json";
const CATALOG_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

interface CatalogCache {
  entries: ModelCatalogEntry[];
  expiresAt: number;
  inFlight?: Promise<ModelCatalogEntry[]>;
}

declare global {
  var __ompWebModelsDevCatalogCache: CatalogCache | undefined;
}

async function fetchCatalog(): Promise<ModelCatalogEntry[]> {
  const response = await fetch(MODELS_DEV_URL, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`models.dev returned HTTP ${response.status}`);
  const entries = flattenModelsDevCatalog(await response.json());
  if (entries.length === 0) throw new Error("models.dev returned an empty catalog");
  return entries;
}

async function loadCatalog(): Promise<ModelCatalogEntry[]> {
  let cache = globalThis.__ompWebModelsDevCatalogCache;
  if (!cache) {
    cache = globalThis.__ompWebModelsDevCatalogCache = { entries: [], expiresAt: 0 };
  }
  if (cache.entries.length > 0 && cache.expiresAt > Date.now()) return cache.entries;
  if (!cache.inFlight) {
    cache.inFlight = fetchCatalog().then((entries) => {
      cache.entries = entries;
      cache.expiresAt = Date.now() + CATALOG_TTL_MS;
      return entries;
    }).finally(() => {
      cache.inFlight = undefined;
    });
  }

  try {
    return await cache.inFlight;
  } catch (error) {
    if (cache.entries.length > 0) return cache.entries;
    throw error;
  }
}

// GET /api/system/models-config/catalog?q=<query>[&provider=<id>][&baseUrl=<url>][&limit=N]
// Searches the models.dev catalog (1h TTL, in-flight dedup) and derives an
// "add model" preset recommendation for the query. Provider/base-url hints
// steer both search ranking and the recommendation's metadata/pricing source.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("q") ?? "").slice(0, 120);
  const provider = (searchParams.get("provider") ?? "").slice(0, 120);
  const baseUrl = (searchParams.get("baseUrl") ?? "").slice(0, 500);
  const parsedLimit = Number.parseInt(searchParams.get("limit") ?? "50", 10);
  const limit = Number.isFinite(parsedLimit) ? parsedLimit : 50;

  try {
    const entries = await loadCatalog();
    const models = searchModelCatalog(entries, query, provider, limit);
    const recommendation = recommendModelCatalogPreset(entries, query, provider, baseUrl);
    return json({ models, recommendation, source: MODELS_DEV_URL });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error), code: "catalog_unavailable" }, { status: 502 });
  }
}
