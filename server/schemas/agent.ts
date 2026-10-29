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

/** Mid-run stream state of one live omp child. */
export const sessionLiveSnapshotSchema = z.looseObject({
  cursor: z.looseObject({ streamId: z.string(), sequence: z.number() }),
  isStreaming: z.boolean(),
  isPromptRunning: z.boolean(),
  isCompacting: z.boolean(),
  streamingMessage: z.unknown().nullable(),
  toolEvents: z.array(z.unknown()),
  responseObserved: z.boolean().optional(),
});

/** Incremental history page plus its live-stream attachment (`SessionSyncResponse`). */
export const sessionSyncResponseSchema = z.looseObject({
  mode: z.enum(["append", "replace"]),
  baseEntryId: z.string().nullable(),
  context: sessionContextSchema,
  cursor: historyCursorSchema,
  hasMore: z.boolean(),
  sessionId: z.string(),
  leafId: z.string().nullable(),
  live: sessionLiveSnapshotSchema.nullable(),
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
