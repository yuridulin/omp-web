/**
 * Display formatting for subagent rows.
 *
 * Pure and total: a missing or nonsensical value renders as an empty string, so
 * a partially-populated roster (older omp, disk-only history) never shows
 * "NaN" or "undefined".
 */

/** Compact token count: `812`, `12.4k`, `1.2M`. */
export function formatTokens(tokens?: number): string {
  if (typeof tokens !== "number" || !Number.isFinite(tokens) || tokens <= 0) return "";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(Math.round(tokens));
}

/** Cost in dollars: `$0.048`, `$1.20`, `<$0.001`. */
export function formatCost(cost?: number): string {
  if (typeof cost !== "number" || !Number.isFinite(cost) || cost <= 0) return "";
  if (cost < 0.001) return "<$0.001";
  if (cost >= 1) return `$${cost.toFixed(2)}`;
  return `$${cost.toFixed(3)}`;
}

/** Fixed duration: `840ms`, `21.5s`, `1m 14s`, `1h 02m`. */
export function formatDuration(ms?: number): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
  const totalSeconds = Math.round(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) {
    const rest = totalSeconds % 60;
    return rest === 0 ? `${minutes}m` : `${minutes}m ${String(rest).padStart(2, "0")}s`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/**
 * Elapsed time of a run, rounded down on purpose: the reference reads `<1 min`
 * until a full minute has passed, so a fresh agent does not claim "1 min".
 */
export function formatElapsed(ms?: number): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export interface ModelLabel {
  /** Model id without the provider prefix (`deepseek-v4.1-flash`). */
  model: string;
  /** Reasoning effort when the server reported one (`high`, `low`, ...). */
  effort: string | null;
}

/**
 * Split `provider/model:effort` into the parts a row shows.
 *
 * `resolvedModel` comes from omp, which appends the thinking level after a
 * colon; a model id may itself contain a colon, so the split is on the LAST one
 * and only when the tail looks like an effort word.
 */
export function modelLabel(resolved?: string): ModelLabel | null {
  if (typeof resolved !== "string" || resolved.trim() === "") return null;
  const trimmed = resolved.trim();
  const colon = trimmed.lastIndexOf(":");
  const tail = colon >= 0 ? trimmed.slice(colon + 1) : "";
  const hasEffort = /^(off|minimal|low|medium|high|xhigh|max)$/.test(tail);
  const base = hasEffort ? trimmed.slice(0, colon) : trimmed;
  const slash = base.lastIndexOf("/");
  return {
    model: slash >= 0 ? base.slice(slash + 1) : base,
    effort: hasEffort ? tail : null,
  };
}
