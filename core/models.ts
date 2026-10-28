/**
 * The `/api/models` catalog, in framework-free form.
 *
 * The API bakes omp's model metadata per entry: the thinking ladder is already
 * resolved to `["off", ...efforts]` for reasoning models and `["off"]`
 * otherwise. The core never calls `/api/models`; a host parses the payload here
 * and hands the result around as plain data.
 */

import { isRecord } from "./guards";

/** A model identified the way omp identifies it. */
export interface ModelRef {
  provider: string;
  modelId: string;
}

export interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  /** Baked effort ladder; "off" is always present. */
  thinkingLevels: readonly string[];
  supportsFastMode: boolean;
  supportsSlowMode: boolean;
  contextWindow?: number;
  maxTokens?: number;
}

export interface ModelCatalog {
  /** Unique by provider+id, in payload order. */
  entries: readonly ModelEntry[];
  defaultModel: ModelRef | null;
}

/** Matches `lib/thinking-levels.ts`; the generic ladder when no model is known. */
export const DEFAULT_THINKING_LEVELS: readonly string[] = Object.freeze([
  "auto",
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

/** Identity used for dedupe and cycling: provider scopes the model id. */
export function modelKey(provider: string, modelId: string): string {
  return `${provider}/${modelId}`;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/** A baked ladder always contains "off"; malformed input degrades to just that. */
function asThinkingLevels(value: unknown): string[] {
  if (!Array.isArray(value)) return ["off"];
  const levels = value.filter((level): level is string => typeof level === "string");
  return levels.includes("off") ? levels : ["off", ...levels];
}

function parseEntry(value: unknown): ModelEntry | null {
  if (!isRecord(value)) return null;
  const id = asNonEmptyString(value.id);
  const provider = asNonEmptyString(value.provider);
  if (id === undefined || provider === undefined) return null;

  const entry: ModelEntry = {
    id,
    // The API already falls back to the id; keep the same display guarantee.
    name: asNonEmptyString(value.name) ?? id,
    provider,
    thinkingLevels: asThinkingLevels(value.thinkingLevels),
    supportsFastMode: value.supportsFastMode === true,
    supportsSlowMode: value.supportsSlowMode === true,
  };
  const contextWindow = value.contextWindow;
  if (typeof contextWindow === "number" && Number.isFinite(contextWindow) && contextWindow > 0) {
    entry.contextWindow = contextWindow;
  }
  const maxTokens = value.maxTokens;
  if (typeof maxTokens === "number" && Number.isFinite(maxTokens) && maxTokens > 0) {
    entry.maxTokens = maxTokens;
  }
  return entry;
}

function parseDefaultModel(value: unknown): ModelRef | null {
  if (!isRecord(value)) return null;
  const provider = asNonEmptyString(value.provider);
  // `/api/models` reports `modelId`; session files and live state use `id`.
  const modelId = asNonEmptyString(value.modelId) ?? asNonEmptyString(value.id);
  if (provider === undefined || modelId === undefined) return null;
  return { provider, modelId };
}

/** Parse the `/api/models` body. Total: any input yields a valid catalog. */
export function parseModelCatalog(payload: unknown): ModelCatalog {
  if (!isRecord(payload)) return { entries: [], defaultModel: null };

  const rawEntries = Array.isArray(payload.modelList) ? payload.modelList : [];
  const seen = new Set<string>();
  const entries: ModelEntry[] = [];
  for (const raw of rawEntries) {
    const entry = parseEntry(raw);
    if (entry === null) continue;
    const key = modelKey(entry.provider, entry.id);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }

  return { entries, defaultModel: parseDefaultModel(payload.defaultModel) };
}

/** Resolve a ref against the catalog. A shared id under another provider does not count. */
export function findModel(catalog: ModelCatalog, ref: ModelRef | null | undefined): ModelEntry | null {
  if (ref === null || ref === undefined) return null;
  for (const entry of catalog.entries) {
    if (entry.provider === ref.provider && entry.id === ref.modelId) return entry;
  }
  return null;
}

/** The model a session should show: explicit choice, omp's default, then the first entry. */
export function resolveModel(catalog: ModelCatalog, explicit: ModelRef | null): ModelEntry | null {
  return findModel(catalog, explicit)
    ?? findModel(catalog, catalog.defaultModel)
    ?? catalog.entries[0]
    ?? null;
}

/** Cycle through payload order with wrap-around. An unknown current behaves like none. */
export function cycleModel(catalog: ModelCatalog, current: ModelEntry | null, step: 1 | -1): ModelEntry | null {
  const { entries } = catalog;
  if (entries.length === 0) return null;
  const index = current === null
    ? -1
    : entries.findIndex((entry) => entry.provider === current.provider && entry.id === current.id);
  if (index === -1) return step === 1 ? entries[0] : entries[entries.length - 1];
  return entries[(index + step + entries.length) % entries.length];
}

/**
 * The ladder to offer: the catalog's baked ladder wins. A model the catalog
 * missed can still be described by live `get_state` efforts.
 */
export function thinkingLevelsFor(entry: ModelEntry, liveEfforts?: readonly string[] | null): readonly string[] {
  if (entry.thinkingLevels.length > 0) return entry.thinkingLevels;
  if (liveEfforts && liveEfforts.length > 0) return ["off", ...liveEfforts];
  return ["off"];
}

/**
 * Clamp a session's level to what the current model offers. omp's "inherit"
 * sentinel and missing values mean "auto"; the result is always selectable.
 */
export function normalizeThinkingLevel(level: string | null | undefined, allowed: readonly string[]): string {
  const candidate = level === null || level === undefined || level === "" || level === "inherit" ? "auto" : level;
  if (allowed.includes(candidate)) return candidate;
  if (allowed.includes("auto")) return "auto";
  return allowed.length > 0 ? allowed[0] : "off";
}

/** Model-level thinking metadata read off a running session's `get_state`. */
export interface ThinkingModelMeta {
  provider: string;
  modelId: string;
  name?: string;
  reasoning?: boolean;
  thinking?: { efforts?: string[] };
}

/**
 * Keep familiar levels ordered while preserving provider-defined additions.
 * `auto` always leads; unknown efforts follow the known ladder in the order
 * they were advertised.
 */
export function selectableThinkingLevels(available: readonly string[] | null | undefined): string[] {
  if (!available) return [...DEFAULT_THINKING_LEVELS];

  const remaining = new Set(available.filter((level) => level && level !== "auto"));
  const ordered = DEFAULT_THINKING_LEVELS.filter((level) => level === "auto" || remaining.delete(level));
  return [...ordered, ...remaining];
}

/** "off" is always a valid selector; concrete efforts come from the model. */
export function thinkingLevelsForMeta(meta: ThinkingModelMeta): string[] {
  if (!meta.reasoning) return ["off"];
  return ["off", ...(meta.thinking?.efforts ?? [])];
}

/**
 * Levels offered for the current model: the catalog's baked ladder wins; the
 * live session model backs non-catalog models. Returns null when neither
 * source knows the model — callers then fall back to the generic ladder.
 */
export function resolveAvailableThinkingLevels(
  catalogLevels: string[] | undefined,
  model: ModelRef | null,
  liveModel: ThinkingModelMeta | null,
): string[] | null {
  if (catalogLevels && catalogLevels.length > 0) return catalogLevels;
  if (model && liveModel && liveModel.provider === model.provider && liveModel.modelId === model.modelId) {
    return thinkingLevelsForMeta(liveModel);
  }
  return null;
}
