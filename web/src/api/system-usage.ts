import { api } from "./client";
import { isRecord } from "./guards";
import type { paths } from "./schema";

type UsagePayload = NonNullable<
  paths["/api/system/usage"]["get"]["responses"][200]["content"]["application/json"]
>;
export type UsageReport = UsagePayload;
export type UsageSummary = UsagePayload["summary"];
export type UsageProviderRow = UsagePayload["providers"][number];
export type UsageModelRow = UsagePayload["modelBreakdown"][number];
export type UsageProjectRow = UsagePayload["projectBreakdown"][number];
export type UsageDayRow = UsagePayload["dayBreakdown"][number];
export type UsageTimePoint = UsagePayload["timeSeries"][number];
export type UsageScanInfo = UsagePayload["scanInfo"];

type ProviderUsagePayload = NonNullable<
  paths["/api/system/provider-usage"]["get"]["responses"][200]["content"]["application/json"]
>;
export type ProviderUsageReport = ProviderUsagePayload["reports"][number];
export type ProviderQuotaWindow = NonNullable<ProviderUsageReport["fiveHour"]>;
export type ProviderUsage = Pick<ProviderUsagePayload, "generatedAt" | "reports">;

export type UsageRange = UsagePayload["timeRange"];
export const USAGE_RANGES: readonly UsageRange[] = ["today", "7d", "30d", "90d", "month", "all"];

export type UsageGranularity = UsagePayload["granularity"];
export const USAGE_GRANULARITIES: readonly UsageGranularity[] = ["daily", "monthly", "projects"];

function errorMessage(value: unknown, status: number): string {
  if (isRecord(value) && typeof value.error === "string" && value.error) return value.error;
  return `HTTP ${status}`;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function parseList<T>(value: unknown, parse: (entry: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.map(parse).filter((entry): entry is T => entry !== null);
}

function isUsageRange(value: unknown): value is UsageRange {
  return typeof value === "string" && (USAGE_RANGES as readonly string[]).includes(value);
}

function isUsageGranularity(value: unknown): value is UsageGranularity {
  return typeof value === "string" && (USAGE_GRANULARITIES as readonly string[]).includes(value);
}

function parseSummary(value: unknown): UsageSummary {
  const raw = isRecord(value) ? value : {};
  const quality = isRecord(raw.costQuality) ? raw.costQuality : {};
  return {
    totalCost: numberValue(raw.totalCost),
    totalTokens: numberValue(raw.totalTokens),
    inputTokens: numberValue(raw.inputTokens),
    outputTokens: numberValue(raw.outputTokens),
    reasoningTokens: numberValue(raw.reasoningTokens),
    cacheReadTokens: numberValue(raw.cacheReadTokens),
    cacheWriteTokens: numberValue(raw.cacheWriteTokens),
    cacheSavings: numberValue(raw.cacheSavings),
    activeDays: numberValue(raw.activeDays),
    tokensPerActiveDay: numberValue(raw.tokensPerActiveDay),
    cachePercentage: numberValue(raw.cachePercentage),
    costQuality: {
      providerReported: numberValue(quality.providerReported),
      modelPriced: numberValue(quality.modelPriced),
      unpriced: numberValue(quality.unpriced),
    },
  };
}

function parseUsageProvider(value: unknown): UsageProviderRow | null {
  if (!isRecord(value) || typeof value.provider !== "string") return null;
  return {
    provider: value.provider,
    name: stringValue(value.name, value.provider),
    cost: numberValue(value.cost),
    tokens: numberValue(value.tokens),
    share: numberValue(value.share),
    color: stringValue(value.color),
  };
}

function parseTimePoint(value: unknown): UsageTimePoint | null {
  if (!isRecord(value) || typeof value.date !== "string") return null;
  const byProvider: UsageTimePoint["byProvider"] = {};
  if (isRecord(value.byProvider)) {
    for (const [provider, entry] of Object.entries(value.byProvider)) {
      if (!isRecord(entry)) continue;
      byProvider[provider] = {
        cost: numberValue(entry.cost),
        tokens: numberValue(entry.tokens),
      };
    }
  }
  return {
    date: value.date,
    label: stringValue(value.label, value.date),
    timestamp: numberValue(value.timestamp),
    totalCost: numberValue(value.totalCost),
    totalTokens: numberValue(value.totalTokens),
    byProvider,
  };
}

function parseModelRow(value: unknown): UsageModelRow | null {
  if (!isRecord(value) || typeof value.model !== "string") return null;
  return {
    model: value.model,
    provider: stringValue(value.provider),
    cost: numberValue(value.cost),
    tokens: numberValue(value.tokens),
    inputTokens: numberValue(value.inputTokens),
    outputTokens: numberValue(value.outputTokens),
    cacheReadTokens: numberValue(value.cacheReadTokens),
    cacheWriteTokens: numberValue(value.cacheWriteTokens),
    reasoningTokens: numberValue(value.reasoningTokens),
    share: numberValue(value.share),
    recordsCount: numberValue(value.recordsCount),
  };
}

function parseDayRow(value: unknown): UsageDayRow | null {
  if (!isRecord(value) || typeof value.date !== "string") return null;
  return {
    date: value.date,
    label: stringValue(value.label, value.date),
    cost: numberValue(value.cost),
    tokens: numberValue(value.tokens),
    inputTokens: numberValue(value.inputTokens),
    outputTokens: numberValue(value.outputTokens),
    cacheReadTokens: numberValue(value.cacheReadTokens),
    share: numberValue(value.share),
  };
}

function parseProjectRow(value: unknown): UsageProjectRow | null {
  if (!isRecord(value) || typeof value.project !== "string") return null;
  return {
    project: value.project,
    projectName: stringValue(value.projectName, value.project),
    cost: numberValue(value.cost),
    tokens: numberValue(value.tokens),
    share: numberValue(value.share),
    sessionsCount: numberValue(value.sessionsCount),
  };
}

function parseScanInfo(value: unknown): UsageScanInfo {
  const raw = isRecord(value) ? value : {};
  return {
    transcriptsScanned: numberValue(raw.transcriptsScanned),
    transcriptsOutsideWindow: numberValue(raw.transcriptsOutsideWindow),
    usageRecordsCount: numberValue(raw.usageRecordsCount),
    durationSeconds: numberValue(raw.durationSeconds),
    scannedAt: numberValue(raw.scannedAt),
  };
}

/** Normalize a usage payload without trusting any field. */
export function parseUsageReport(value: unknown): UsageReport {
  const raw = isRecord(value) ? value : {};
  return {
    timeRange: isUsageRange(raw.timeRange) ? raw.timeRange : "30d",
    granularity: isUsageGranularity(raw.granularity) ? raw.granularity : "daily",
    summary: parseSummary(raw.summary),
    providers: parseList(raw.providers, parseUsageProvider),
    timeSeries: parseList(raw.timeSeries, parseTimePoint),
    modelBreakdown: parseList(raw.modelBreakdown, parseModelRow),
    dayBreakdown: parseList(raw.dayBreakdown, parseDayRow),
    projectBreakdown: parseList(raw.projectBreakdown, parseProjectRow),
    scanInfo: parseScanInfo(raw.scanInfo),
  };
}

function parseQuotaWindow(value: unknown): ProviderQuotaWindow | null {
  if (!isRecord(value)) return null;
  const window: ProviderQuotaWindow = { percent: numberValue(value.percent) };
  if (typeof value.resetMinutes === "number" && Number.isFinite(value.resetMinutes)) {
    window.resetMinutes = value.resetMinutes;
  }
  if (typeof value.resetHours === "number" && Number.isFinite(value.resetHours)) {
    window.resetHours = value.resetHours;
  }
  return window;
}

function parseProviderReport(value: unknown): ProviderUsageReport | null {
  if (!isRecord(value) || typeof value.provider !== "string") return null;
  const report: ProviderUsageReport = { provider: value.provider };
  if (typeof value.accountLabel === "string") report.accountLabel = value.accountLabel;
  if (typeof value.accountIndex === "number" && Number.isFinite(value.accountIndex)) {
    report.accountIndex = value.accountIndex;
  }
  if (typeof value.plan === "string") report.plan = value.plan;
  if (typeof value.modelId === "string") report.modelId = value.modelId;
  if (typeof value.tier === "string") report.tier = value.tier;
  if (typeof value.bucket === "string") report.bucket = value.bucket;
  if (typeof value.noLimits === "boolean") report.noLimits = value.noLimits;

  const fiveHour = parseQuotaWindow(value.fiveHour);
  if (fiveHour) report.fiveHour = fiveHour;
  const sevenDay = parseQuotaWindow(value.sevenDay);
  if (sevenDay) report.sevenDay = sevenDay;
  const monthly = parseQuotaWindow(value.monthly);
  if (monthly) report.monthly = monthly;

  return report;
}

/** Normalize a provider quota payload without trusting any field. */
export function parseProviderUsage(value: unknown): ProviderUsage {
  const raw = isRecord(value) ? value : {};
  return {
    generatedAt:
      typeof raw.generatedAt === "number" && Number.isFinite(raw.generatedAt)
        ? raw.generatedAt
        : null,
    reports: parseList(raw.reports, parseProviderReport),
  };
}

export async function fetchUsageReport(
  range: UsageRange,
  granularity: UsageGranularity,
): Promise<UsageReport> {
  const { data, error, response } = await api.GET("/api/system/usage", {
    params: { query: { range, granularity } },
  });
  if (error) throw new Error(errorMessage(error, response.status));
  return parseUsageReport(data);
}

export async function fetchProviderUsage(): Promise<ProviderUsage> {
  const { data, error, response } = await api.GET("/api/system/provider-usage");
  if (error) throw new Error(errorMessage(error, response.status));
  return parseProviderUsage(data);
}

/** Format an integer-like count with thousands separators. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** Compact token counts for summary cards (12.4K, 3.2M). */
export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const absolute = Math.abs(value);
  if (absolute < 1_000) return formatNumber(value);
  const units: readonly [number, string][] = [
    [1_000_000_000, "B"],
    [1_000_000, "M"],
    [1_000, "K"],
  ];
  for (const [size, suffix] of units) {
    if (absolute >= size) {
      const scaled = value / size;
      return `${scaled.toFixed(1).replace(/\.0$/, "")}${suffix}`;
    }
  }
  return formatNumber(value);
}

/** US-dollar amount; tiny non-zero costs keep enough precision to be useful. */
export function formatCost(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "$0.00";
  if (Math.abs(value) < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

/** Percentage already expressed on a 0-100 scale. */
export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  const bounded = Math.min(100, Math.max(0, value));
  return `${bounded.toFixed(digits)}%`;
}

/** Human-friendly reset countdown from whichever fields the provider sent. */
export function formatQuotaReset(window: ProviderQuotaWindow | undefined): string {
  if (!window) return "";
  const minutes =
    window.resetMinutes ??
    (typeof window.resetHours === "number" ? window.resetHours * 60 : null);
  if (minutes === null) return "";
  if (minutes <= 0) return "resets now";
  if (minutes < 60) return `resets in ${Math.ceil(minutes)}m`;
  if (minutes < 60 * 24) return `resets in ${Math.ceil(minutes / 60)}h`;
  return `resets in ${Math.ceil(minutes / (60 * 24))}d`;
}
