import { z } from "zod";

/**
 * Shared wire schemas for the agent-domain routes.
 *
 * These mirror the server-side types (`core/types.ts`, `lib/session-sync.ts`,
 * `lib/subagent-history.ts`, `lib/api-types.ts`). Payloads owned by omp (message
 * lists, projected trees, live snapshots, state) stay `z.unknown()`: omp-web
 * forwards them verbatim and does not validate their inner shape.
 */

/** Session list row (`SessionInfo` in core/types.ts). */
export const sessionSummarySchema = z.looseObject({
  path: z.string(),
  id: z.string(),
  cwd: z.string(),
  name: z.string().optional(),
  created: z.string(),
  modified: z.string(),
  lastMessageAt: z.string().optional(),
  messageCount: z.number(),
  firstMessage: z.string(),
  parentSessionId: z.string().optional(),
  projectRoot: z.string().optional(),
  projectKey: z.string().optional(),
  worktreeBranch: z.string().optional(),
  archived: z.boolean().optional(),
});

/** Session detail header projection returned by GET /sessions/[id]. */
export const sessionInfoSchema = z.looseObject({
  path: z.string(),
  id: z.string(),
  cwd: z.string(),
  name: z.string().optional(),
  created: z.string().optional(),
  modified: z.string(),
  messageCount: z.number(),
  firstMessage: z.string(),
  parentSessionId: z.string().optional(),
});

/** Archived (gzip) session metadata (`ArchivedSessionInfo`). */
export const archivedSessionSchema = z.looseObject({
  key: z.string(),
  id: z.string(),
  cwd: z.string(),
  name: z.string().optional(),
  created: z.string(),
  archivedAt: z.string(),
  messageCount: z.number(),
  firstMessage: z.string(),
  size: z.number(),
  status: z.enum(["complete", "interrupted", "aborted", "error", "pending", "unknown"]).optional(),
});

/** A live omp child tracked by the RPC manager. */
export const runningSessionSchema = z.looseObject({
  id: z.string(),
  cwd: z.string(),
});

/** An omp child that exited unexpectedly (`ExitedRpcSession`). */
export const exitedSessionSchema = z.looseObject({
  id: z.string(),
  cwd: z.string(),
  at: z.number(),
  code: z.number().nullable(),
  signal: z.string().nullable(),
  detail: z.string(),
});

/** Durable display-history position (`HistoryCursor`). */
export const historyCursorSchema = z.looseObject({
  firstEntryId: z.string().nullable(),
  lastEntryId: z.string().nullable(),
});

/** Materialized transcript context (`SessionContext` in core/types.ts). */
export const sessionContextSchema = z.looseObject({
  messages: z.array(z.unknown()),
  entryIds: z.array(z.string()),
  thinkingLevel: z.string(),
  model: z.looseObject({ provider: z.string(), modelId: z.string() }).nullable(),
  todoPhases: z.array(z.unknown()),
});

/** Incremental history page plus the authoritative live snapshot. */
export const sessionSyncResponseSchema = z.looseObject({
  mode: z.enum(["append", "replace", "prepend"]),
  baseEntryId: z.string().nullable(),
  context: sessionContextSchema,
  cursor: historyCursorSchema,
  hasMore: z.boolean(),
  hasOlder: z.boolean(),
  sessionId: z.string(),
  leafId: z.string().nullable(),
  snapshot: z.unknown().nullable().optional(),
});

/** One byte-window page of a subagent transcript. */
export const subagentTranscriptPageSchema = z.looseObject({
  sessionFile: z.string(),
  fromByte: z.number(),
  nextByte: z.number(),
  reset: z.boolean(),
  messages: z.array(z.unknown()),
  error: z.string().optional(),
  totalBytes: z.number().optional(),
});

/** Settled per-subagent telemetry from the parent's `task` toolResult. */
export const subagentResultSchema = z.looseObject({
  exitCode: z.number().optional(),
  truncated: z.boolean().optional(),
  cost: z.number().optional(),
  structuredOutput: z
    .looseObject({
      source: z.string().optional(),
      mode: z.string().optional(),
      status: z.string().optional(),
      error: z.string().optional(),
    })
    .optional(),
  error: z.string().optional(),
  aborted: z.boolean().optional(),
  abortReason: z.string().optional(),
  outputPath: z.string().optional(),
  patchPath: z.string().optional(),
  branchName: z.string().optional(),
});

/**
 * One subagent row of a session's on-disk roster (`SubagentHistoryEntry` in
 * `lib/subagent-types.ts`), recovered from the parent file's `task` results.
 * Every telemetry field is optional: they arrive per omp version.
 */
export const subagentRosterEntrySchema = z.looseObject({
  id: z.string(),
  agent: z.string(),
  agentSource: z.enum(["bundled", "user", "project"]).optional(),
  status: z.enum(["started", "completed", "failed", "aborted"]),
  task: z.string().optional(),
  assignment: z.string().optional(),
  description: z.string().optional(),
  index: z.number(),
  parentToolCallId: z.string().optional(),
  batchSeq: z.number().optional(),
  sessionFile: z.string().optional(),
  transcriptAvailable: z.boolean(),
  detached: z.boolean().optional(),
  lastIntent: z.string().optional(),
  toolCount: z.number().optional(),
  requests: z.number().optional(),
  tokens: z.number().optional(),
  contextTokens: z.number().optional(),
  contextWindow: z.number().optional(),
  cost: z.number().optional(),
  durationMs: z.number().optional(),
  modelOverride: z.union([z.string(), z.array(z.string())]).optional(),
  modelRole: z.string().optional(),
  resolvedModel: z.string().optional(),
  resolvedModelIsFallback: z.boolean().optional(),
  retryFailure: z.looseObject({ attempt: z.number(), errorMessage: z.string() }).optional(),
  result: subagentResultSchema.optional(),
});

/** On-disk roster of one session's subagents. */
export const subagentRosterResponseSchema = z.looseObject({
  subagents: z.array(subagentRosterEntrySchema),
});

/** Transcript page (`fromByte`) or completion artifact (`mode=completion`). */
export const subagentTranscriptResponseSchema = z.looseObject({
  sessionFile: z.string(),
  fromByte: z.number().optional(),
  nextByte: z.number().optional(),
  reset: z.boolean().optional(),
  messages: z.array(z.unknown()).optional(),
  completion: z.string().nullable().optional(),
  truncated: z.boolean().optional(),
  error: z.string().optional(),
  totalBytes: z.number().optional(),
});

export const pluginResourceCountsSchema = z.looseObject({
  extensions: z.number(),
  skills: z.number(),
  prompts: z.number(),
  themes: z.number(),
});

export const pluginResourceSchema = z.looseObject({
  kind: z.enum(["extension", "skill", "prompt", "theme"]),
  name: z.string(),
  path: z.string(),
  relativePath: z.string(),
});

export const pluginDiagnosticSchema = z.looseObject({
  type: z.enum(["warning", "error"]),
  message: z.string(),
  source: z.string().optional(),
  path: z.string().optional(),
});

export const pluginPackageSchema = z.looseObject({
  source: z.string(),
  scope: z.enum(["global", "project"]),
  filtered: z.boolean(),
  disabled: z.boolean(),
  installedPath: z.string().optional(),
  packageName: z.string().optional(),
  version: z.string().optional(),
  configuredVersion: z.string().optional(),
  counts: pluginResourceCountsSchema,
  resources: z.array(pluginResourceSchema),
  status: z.enum(["loaded", "installed", "missing", "disabled"]),
});

/** `PluginsResponse` in lib/api-types.ts. */
export const pluginsResponseSchema = z.looseObject({
  packages: z.array(pluginPackageSchema),
  totals: pluginResourceCountsSchema,
  diagnostics: z.array(pluginDiagnosticSchema),
});
