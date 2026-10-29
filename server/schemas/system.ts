import { z } from "zod";

/**
 * Shared response/request shapes for the system routes.
 *
 * These mirror the lib/ types the handlers return. Every object is loose so
 * omp can add fields without breaking the generated OpenAPI document.
 */

const modelCostSchema = z.looseObject({
  input: z.number().optional(),
  output: z.number().optional(),
  cacheRead: z.number().optional(),
  cacheWrite: z.number().optional(),
});

const thinkingConfigSchema = z.looseObject({
  mode: z.string().optional(),
  efforts: z.array(z.string()).optional(),
  defaultLevel: z.string().optional(),
  effortMap: z.record(z.string(), z.string()).optional(),
});

export const modelDefinitionSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  api: z.string().optional(),
  baseUrl: z.string().optional(),
  reasoning: z.boolean().optional(),
  thinking: thinkingConfigSchema.optional(),
  input: z.array(z.string()).optional(),
  contextWindow: z.number().optional(),
  maxTokens: z.number().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  cost: modelCostSchema.optional(),
  compat: z.record(z.string(), z.unknown()).optional(),
});

export const providerConfigSchema = z.looseObject({
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  api: z.string().optional(),
  auth: z.enum(["apiKey", "none", "oauth"]).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  compat: z.record(z.string(), z.unknown()).optional(),
  models: z.array(modelDefinitionSchema).optional(),
  modelOverrides: z.record(z.string(), z.unknown()).optional(),
});

/** models.yml: arbitrary top-level keys plus the `providers` map. */
export const modelsConfigSchema = z.looseObject({
  providers: z.record(z.string(), providerConfigSchema).optional(),
});

export const nativeSettingsSchema = z.looseObject({
  defaultThinkingLevel: z.enum(["auto", "minimal", "low", "medium", "high", "xhigh", "max"]).optional(),
  providers: z.looseObject({
    autoThinkingSource: z.enum(["classifier", "vendor"]).optional(),
  }).optional(),
  hideThinkingBlock: z.boolean().optional(),
  externalThinking: z.boolean().optional(),
  textVerbosity: z.enum(["low", "medium", "high"]).optional(),
  personality: z.enum(["default", "friendly", "pragmatic", "none"]).optional(),
  advisor: z.looseObject({
    enabled: z.boolean().optional(),
    subagents: z.boolean().optional(),
    syncBacklog: z.enum(["off", "1", "3", "5"]).optional(),
    immuneTurns: z.number().optional(),
  }).optional(),
  tools: z.looseObject({
    approvalMode: z.enum(["always-ask", "write", "yolo"]).optional(),
    approval: z.looseObject({
      bash: z.enum(["allow", "prompt", "deny"]).optional(),
      extension: z.enum(["allow", "prompt"]).optional(),
    }).optional(),
  }).optional(),
  skills: z.looseObject({
    showStartupDiagnostics: z.boolean().optional(),
  }).optional(),
  enabledModels: z.array(z.string()).optional(),
  disabledProviders: z.array(z.string()).optional(),
  modelProviderOrder: z.array(z.string()).optional(),
  registryHasScopedEntries: z.boolean().optional(),
  retry: z.looseObject({
    enabled: z.boolean().optional(),
    maxRetries: z.number().optional(),
    modelFallback: z.boolean().optional(),
    fallbackRevertPolicy: z.enum(["cooldown-expiry", "never"]).optional(),
    fallbackChains: z.record(z.string(), z.array(z.string())).optional(),
  }).optional(),
  compaction: z.looseObject({
    enabled: z.boolean().optional(),
    midTurnEnabled: z.boolean().optional(),
    methodOrder: z.array(z.string()).optional(),
    autoContinue: z.boolean().optional(),
    keepRecentTokens: z.number().optional(),
  }).optional(),
  memory: z.looseObject({
    backend: z.enum(["off", "local", "mnemopi", "hindsight"]).optional(),
  }).optional(),
  autolearn: z.looseObject({
    enabled: z.boolean().optional(),
    autoContinue: z.boolean().optional(),
    minToolCalls: z.number().optional(),
  }).optional(),
  mnemopi: z.looseObject({
    scoping: z.enum(["global", "per-project", "per-project-tagged"]).optional(),
    autoRecall: z.boolean().optional(),
    autoRetain: z.boolean().optional(),
    noEmbeddings: z.boolean().optional(),
  }).optional(),
  mcp: z.looseObject({
    enableProjectConfig: z.boolean().optional(),
    renderMarkdownResults: z.boolean().optional(),
    notifications: z.boolean().optional(),
    notificationDebounceMs: z.number().optional(),
  }).optional(),
});

const providerUsageWindowSchema = z.looseObject({
  percent: z.number(),
  resetMinutes: z.number().optional(),
  resetHours: z.number().optional(),
});

const providerUsageReportSchema = z.looseObject({
  provider: z.string(),
  accountLabel: z.string().optional(),
  accountIndex: z.number().optional(),
  plan: z.string().optional(),
  modelId: z.string().optional(),
  tier: z.string().optional(),
  bucket: z.string().optional(),
  noLimits: z.boolean().optional(),
  fiveHour: providerUsageWindowSchema.optional(),
  sevenDay: providerUsageWindowSchema.optional(),
  monthly: providerUsageWindowSchema.optional(),
});

export const providerUsageSnapshotSchema = z.looseObject({
  generatedAt: z.number().nullable(),
  reports: z.array(providerUsageReportSchema),
});

const usageSummarySchema = z.looseObject({
  totalCost: z.number(),
  totalTokens: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  reasoningTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheWriteTokens: z.number(),
  cacheSavings: z.number(),
  activeDays: z.number(),
  tokensPerActiveDay: z.number(),
  cachePercentage: z.number(),
  costQuality: z.looseObject({
    providerReported: z.number(),
    modelPriced: z.number(),
    unpriced: z.number(),
  }),
});

const providerUsageSummarySchema = z.looseObject({
  provider: z.string(),
  name: z.string(),
  cost: z.number(),
  tokens: z.number(),
  share: z.number(),
  color: z.string(),
});

const modelUsageSummarySchema = z.looseObject({
  model: z.string(),
  provider: z.string(),
  cost: z.number(),
  tokens: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheWriteTokens: z.number(),
  reasoningTokens: z.number(),
  share: z.number(),
  recordsCount: z.number(),
});

const timeSeriesPointSchema = z.looseObject({
  date: z.string(),
  label: z.string(),
  timestamp: z.number(),
  totalCost: z.number(),
  totalTokens: z.number(),
  byProvider: z.record(z.string(), z.looseObject({ cost: z.number(), tokens: z.number() })),
});

const dayUsageSummarySchema = z.looseObject({
  date: z.string(),
  label: z.string(),
  cost: z.number(),
  tokens: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  share: z.number(),
});

const projectUsageSummarySchema = z.looseObject({
  project: z.string(),
  projectName: z.string(),
  cost: z.number(),
  tokens: z.number(),
  share: z.number(),
  sessionsCount: z.number(),
});

const usageScanInfoSchema = z.looseObject({
  transcriptsScanned: z.number(),
  transcriptsOutsideWindow: z.number(),
  usageRecordsCount: z.number(),
  durationSeconds: z.number(),
  scannedAt: z.number(),
});

export const usageReportSchema = z.looseObject({
  timeRange: z.enum(["today", "7d", "30d", "90d", "month", "all"]),
  granularity: z.enum(["daily", "monthly", "projects"]),
  summary: usageSummarySchema,
  providers: z.array(providerUsageSummarySchema),
  timeSeries: z.array(timeSeriesPointSchema),
  modelBreakdown: z.array(modelUsageSummarySchema),
  dayBreakdown: z.array(dayUsageSummarySchema),
  projectBreakdown: z.array(projectUsageSummarySchema),
  scanInfo: usageScanInfoSchema,
});

const selfUpdateStatusSchema = z.looseObject({
  attemptId: z.string(),
  state: z.enum(["prepared", "running", "succeeded", "failed"]),
  stage: z.enum(["preparing", "stopping", "installing", "restarting", "finalizing"]).optional(),
  fromVersion: z.string(),
  targetVersion: z.string(),
  preparedAt: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  recovered: z.boolean().optional(),
  error: z.string().optional(),
  cleanupReady: z.boolean().optional(),
});

export const ompUpdateStatusSchema = z.looseObject({
  currentVersion: z.string().nullable(),
  availableVersion: z.string().nullable(),
  updateAvailable: z.boolean(),
  updateCommand: z.string(),
  updatesDisabled: z.boolean().optional(),
});

/** Response body of the update/status and update/acknowledge actions. */
export const selfUpdateStatusResponseSchema = z.union([selfUpdateStatusSchema, z.null()]);
