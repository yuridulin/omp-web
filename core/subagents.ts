/**
 * Subagent domain: total parsers for the live subagent frames, the roster fold
 * shared with on-disk history, and a reducer that folds roster + live activity.
 *
 * Wire payloads are untrusted; every parser either returns a fully-formed value
 * or `null`, so a malformed frame degrades to "ignore" instead of inventing a
 * chip. Frames that carry no timestamp are stamped by the caller-supplied
 * `now`; parsers default it to 0 ("unknown") and the reducer requires it, so a
 * fold never reads the wall clock on its own.
 */

import { isRecord } from "./guards";

/** Distinct subagent ids retained in the activity/version maps. */
const ACTIVITY_MAX_IDS = 64;
/** Activity entries kept per subagent id. */
const ACTIVITY_MAX = 50;

export type SubagentStatus = "started" | "completed" | "failed" | "aborted";
export type SubagentAgentSource = "bundled" | "user" | "project";

export interface SubagentRetryState {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  errorMessage: string;
  startedAtMs: number;
}

/** Live per-subagent progress snapshot. */
export interface SubagentProgress {
  index?: number;
  id?: string;
  agent?: string;
  agentSource?: SubagentAgentSource;
  status?: "pending" | "running" | "completed" | "failed" | "aborted";
  task?: string;
  assignment?: string;
  description?: string;
  lastIntent?: string;
  currentTool?: string;
  currentToolArgs?: string;
  currentToolStartMs?: number;
  recentTools?: Array<{ tool: string; args: string; endMs: number }>;
  recentOutput?: string[];
  toolCount?: number;
  requests?: number;
  tokens?: number;
  contextTokens?: number;
  contextWindow?: number;
  cost?: number;
  durationMs?: number;
  modelOverride?: string | string[];
  modelRole?: string;
  resolvedModel?: string;
  resolvedModelIsFallback?: boolean;
  retryState?: SubagentRetryState;
  retryFailure?: { attempt: number; errorMessage: string };
  inflightTaskDetails?: unknown;
  extractedToolData?: Record<string, unknown[]>;
}

/** Compact live-activity entry derived from `subagent_event` frames. */
export interface SubagentActivityEvent {
  kind: "tool" | "text" | "notice";
  label: string;
  ts: number;
}

export interface SubagentInfo {
  id: string;
  agent: string;
  agentSource?: SubagentAgentSource;
  description?: string;
  status: SubagentStatus;
  task?: string;
  assignment?: string;
  sessionFile?: string;
  parentToolCallId?: string;
  /** Position inside the spawning `task` call's batch; pairs with `batchSeq`. */
  index: number;
  detached?: boolean;
  progress?: SubagentProgress;
  lastUpdate?: number;
  result?: Record<string, unknown>;
  /** Roster origin: live frames (default) vs on-disk history. */
  source?: "live" | "history";
  /** Ordinal of the `task` call that spawned this agent, as recorded on disk. */
  batchSeq?: number;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asAgentSource(value: unknown): SubagentAgentSource | undefined {
  return value === "bundled" || value === "user" || value === "project" ? value : undefined;
}

function asProgressStatus(value: unknown): SubagentProgress["status"] | undefined {
  return value === "pending" || value === "running" || value === "completed" || value === "failed" || value === "aborted"
    ? value
    : undefined;
}

/** Defensively copy an AgentProgress-shaped object into a `SubagentProgress`. */
export function parseSubagentProgress(value: unknown): SubagentProgress | null {
  if (!isRecord(value)) return null;
  const out: SubagentProgress = {};
  const index = asNumber(value.index);
  if (index !== undefined) out.index = index;
  const id = asString(value.id);
  if (id !== undefined) out.id = id;
  const agent = asString(value.agent);
  if (agent !== undefined) out.agent = agent;
  const agentSource = asAgentSource(value.agentSource);
  if (agentSource !== undefined) out.agentSource = agentSource;
  const status = asProgressStatus(value.status);
  if (status !== undefined) out.status = status;
  const task = asString(value.task);
  if (task !== undefined) out.task = task;
  const assignment = asString(value.assignment);
  if (assignment !== undefined) out.assignment = assignment;
  const description = asString(value.description);
  if (description !== undefined) out.description = description;
  const lastIntent = asString(value.lastIntent);
  if (lastIntent !== undefined) out.lastIntent = lastIntent;
  const currentTool = asString(value.currentTool);
  if (currentTool !== undefined) out.currentTool = currentTool;
  const currentToolArgs = asString(value.currentToolArgs);
  if (currentToolArgs !== undefined) out.currentToolArgs = currentToolArgs;
  const currentToolStartMs = asNumber(value.currentToolStartMs);
  if (currentToolStartMs !== undefined) out.currentToolStartMs = currentToolStartMs;
  if (Array.isArray(value.recentTools)) out.recentTools = value.recentTools as SubagentProgress["recentTools"];
  if (Array.isArray(value.recentOutput)) {
    out.recentOutput = value.recentOutput.filter((entry): entry is string => typeof entry === "string");
  }
  const toolCount = asNumber(value.toolCount);
  if (toolCount !== undefined) out.toolCount = toolCount;
  const requests = asNumber(value.requests);
  if (requests !== undefined) out.requests = requests;
  const tokens = asNumber(value.tokens);
  if (tokens !== undefined) out.tokens = tokens;
  const contextTokens = asNumber(value.contextTokens);
  if (contextTokens !== undefined) out.contextTokens = contextTokens;
  const contextWindow = asNumber(value.contextWindow);
  if (contextWindow !== undefined) out.contextWindow = contextWindow;
  const cost = asNumber(value.cost);
  if (cost !== undefined) out.cost = cost;
  const durationMs = asNumber(value.durationMs);
  if (durationMs !== undefined) out.durationMs = durationMs;
  if (
    typeof value.modelOverride === "string"
    || (Array.isArray(value.modelOverride) && value.modelOverride.every((entry) => typeof entry === "string"))
  ) {
    out.modelOverride = value.modelOverride;
  }
  const modelRole = asString(value.modelRole);
  if (modelRole !== undefined) out.modelRole = modelRole;
  const resolvedModel = asString(value.resolvedModel);
  if (resolvedModel !== undefined) out.resolvedModel = resolvedModel;
  if (typeof value.resolvedModelIsFallback === "boolean") out.resolvedModelIsFallback = value.resolvedModelIsFallback;
  if (isRecord(value.retryState)) {
    const attempt = asNumber(value.retryState.attempt);
    const maxAttempts = asNumber(value.retryState.maxAttempts);
    const delayMs = asNumber(value.retryState.delayMs);
    const errorMessage = asString(value.retryState.errorMessage);
    const startedAtMs = asNumber(value.retryState.startedAtMs);
    // All fields are required upstream; defaulting a partial frame would
    // render a false "retrying" state.
    if (attempt !== undefined && maxAttempts !== undefined && delayMs !== undefined && errorMessage !== undefined && startedAtMs !== undefined) {
      out.retryState = { attempt, maxAttempts, delayMs, errorMessage, startedAtMs };
    }
  }
  if (isRecord(value.retryFailure)) {
    const attempt = asNumber(value.retryFailure.attempt);
    const errorMessage = asString(value.retryFailure.errorMessage);
    if (attempt !== undefined && errorMessage !== undefined) out.retryFailure = { attempt, errorMessage };
  }
  if (value.inflightTaskDetails !== undefined) out.inflightTaskDetails = value.inflightTaskDetails;
  if (isRecord(value.extractedToolData)) out.extractedToolData = value.extractedToolData as Record<string, unknown[]>;
  return Object.keys(out).length > 0 ? out : null;
}

/** Map a `subagent_lifecycle` frame to roster form.
 *
 * Stricter than a snapshot: requires id + status, `agent` defaults to
 * "subagent", and unknown statuses must not fabricate a live chip. */
export function parseSubagentLifecycle(value: unknown, now = 0): SubagentInfo | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  const statusRaw = asString(value.status);
  if (!id || !statusRaw) return null;
  if (statusRaw !== "started" && statusRaw !== "completed" && statusRaw !== "failed" && statusRaw !== "aborted") return null;
  const info: SubagentInfo = {
    id,
    agent: asString(value.agent) ?? "subagent",
    status: statusRaw,
    index: asNumber(value.index) ?? -1,
    lastUpdate: now,
    source: "live",
  };
  const agentSource = asAgentSource(value.agentSource);
  if (agentSource !== undefined) info.agentSource = agentSource;
  const description = asString(value.description);
  if (description !== undefined) info.description = description;
  const sessionFile = asString(value.sessionFile);
  if (sessionFile !== undefined) info.sessionFile = sessionFile;
  const parentToolCallId = asString(value.parentToolCallId);
  if (parentToolCallId !== undefined) info.parentToolCallId = parentToolCallId;
  if (typeof value.detached === "boolean") info.detached = value.detached;
  return info;
}

/** Extract a compact live-activity entry from a `subagent_event` payload. */
export function parseSubagentActivityEvent(value: unknown, now = 0): SubagentActivityEvent | null {
  if (!isRecord(value)) return null;
  const event = isRecord(value.event) ? value.event : null;
  if (!event) return null;
  const type = asString(event.type);
  const ts = now;
  if (type === "tool_execution_start") {
    const toolName = asString(event.toolName) ?? "tool";
    const intent = asString(event.intent)?.trim();
    if (intent) return { kind: "tool", label: `→ ${toolName} — ${intent}`, ts };
    const args = isRecord(event.args) ? Object.keys(event.args).slice(0, 3).join(", ") : undefined;
    return { kind: "tool", label: args ? `→ ${toolName} (${args})` : `→ ${toolName}`, ts };
  }
  if (type === "message_end") {
    const message = isRecord(event.message) ? event.message : null;
    if (message && message.role === "assistant") {
      const content = message.content;
      const text = typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content
            .filter((block): block is { type: "text"; text?: unknown } => isRecord(block) && block.type === "text")
            .map((block) => (typeof block.text === "string" ? block.text : ""))
            .join("\n")
          : "";
      const trimmed = text.trim();
      if (trimmed) return { kind: "text", label: trimmed.slice(0, 140), ts };
    }
  }
  if (type === "notice") {
    const message = asString(event.message);
    if (message) return { kind: "notice", label: message.slice(0, 140), ts };
  }
  return null;
}

/** Spawning call first, then position inside that call, then id. A batch the
 * file has not recorded yet sorts last. */
export function compareSubagents(a: SubagentInfo, b: SubagentInfo): number {
  const batchSeqA = a.batchSeq ?? Number.MAX_SAFE_INTEGER;
  const batchSeqB = b.batchSeq ?? Number.MAX_SAFE_INTEGER;
  return batchSeqA - batchSeqB || a.index - b.index || a.id.localeCompare(b.id);
}

/**
 * Fold roster entries into the previous list, ordered by spawning call and then
 * position within that call.
 *
 * Live frames win over on-disk history for the same id. `skipNewerThan` lets a
 * caller refuse to overwrite entries that live frames touched at or after a
 * point-in-time snapshot was requested, so a stale snapshot cannot regress a
 * child's terminal status.
 *
 * `batchSeq` survives every precedence rule: only the session file knows launch
 * order, and the history entry carrying it is often the one that loses to a
 * newer live frame.
 */
export function mergeRoster(
  prev: readonly SubagentInfo[],
  incoming: readonly SubagentInfo[],
  skipNewerThan?: number,
): readonly SubagentInfo[] {
  const byId = new Map<string, SubagentInfo>(prev.map((subagent) => [subagent.id, subagent]));
  for (const entry of incoming) {
    const existing = byId.get(entry.id);
    if (!existing) {
      byId.set(entry.id, entry);
      continue;
    }
    const batchSeq = existing.batchSeq ?? entry.batchSeq;
    if (skipNewerThan !== undefined && (existing.lastUpdate ?? 0) >= skipNewerThan) {
      if (batchSeq !== existing.batchSeq) byId.set(entry.id, { ...existing, batchSeq });
      continue;
    }
    if (entry.source === "history" && existing.source !== "history") {
      if (batchSeq !== existing.batchSeq) byId.set(entry.id, { ...existing, batchSeq });
      continue;
    }
    if (entry.source !== "history" && existing.source === "history") {
      byId.set(entry.id, { ...entry, batchSeq });
      continue;
    }
    byId.set(entry.id, { ...existing, ...entry, batchSeq });
  }
  return [...byId.values()].sort(compareSubagents);
}

export interface SubagentsState {
  roster: readonly SubagentInfo[];
  activity: Readonly<Record<string, readonly SubagentActivityEvent[]>>;
  transcriptVersions: Readonly<Record<string, number>>;
}

export const EMPTY_SUBAGENTS: SubagentsState = Object.freeze({
  roster: Object.freeze([]) as readonly SubagentInfo[],
  activity: Object.freeze({}) as Readonly<Record<string, readonly SubagentActivityEvent[]>>,
  transcriptVersions: Object.freeze({}) as Readonly<Record<string, number>>,
});

/** Keep only the most recently inserted entries of an id-keyed map.
 *
 * JS orders integer-like keys before string keys regardless of insertion, so
 * those are evicted last: their relative age is unknowable, and an actively
 * updated digits-only id must never be the one wrongly pruned. */
function pruneIdMap<T>(map: Readonly<Record<string, T>>): Readonly<Record<string, T>> {
  const keys = Object.keys(map);
  if (keys.length <= ACTIVITY_MAX_IDS) return map;
  const next: Record<string, T> = { ...map };
  let over = keys.length - ACTIVITY_MAX_IDS;
  for (const key of keys.filter((candidate) => !/^(?:0|[1-9]\d*)$/.test(candidate))) {
    if (over <= 0) break;
    delete next[key];
    over -= 1;
  }
  if (over > 0) {
    for (const key of keys) {
      if (over <= 0) break;
      if (next[key] === undefined) continue;
      delete next[key];
      over -= 1;
    }
  }
  return next;
}

/** Merge one throttled progress snapshot into the chip that names it.
 *
 * A frame that carries a valid `progress.id` only updates that id: falling back
 * to `parentToolCallId`/`index` after the id is gone could overwrite a
 * different child. ID-less frames try the exact (parent, index) pair first,
 * then each key alone, and are dropped when nothing matches — a progress frame
 * never invents a chip. */
function applyProgress(state: SubagentsState, payload: unknown, now: number): SubagentsState {
  if (!isRecord(payload)) return state;
  const progress = parseSubagentProgress(payload.progress);
  const progressId = progress?.id;
  const index = asNumber(payload.index) ?? progress?.index ?? -1;
  const parentToolCallId = asString(payload.parentToolCallId) ?? null;
  const task = typeof payload.task === "string" && payload.task.trim() ? payload.task : (progress?.task ?? null);
  const assignment = asString(payload.assignment) ?? progress?.assignment;
  if (!progressId && !task && !parentToolCallId && index < 0) return state;
  if (state.roster.length === 0) return state;

  let target = -1;
  if (progressId) {
    target = state.roster.findIndex((subagent) => subagent.id === progressId);
  } else {
    if (parentToolCallId && index >= 0) {
      target = state.roster.findIndex((subagent) => subagent.parentToolCallId === parentToolCallId && subagent.index === index);
    }
    if (target === -1 && parentToolCallId) {
      target = state.roster.findIndex((subagent) => subagent.parentToolCallId === parentToolCallId);
    }
    if (target === -1 && index >= 0) target = state.roster.findIndex((subagent) => subagent.index === index);
  }
  if (target === -1) return state;

  const current = state.roster[target];
  const nextEntry: SubagentInfo = {
    ...current,
    agent: asString(payload.agent) ?? current.agent,
    // The agent-source literal lives in payload.agentSource; payload.agent
    // holds the agent name.
    agentSource: asAgentSource(payload.agentSource) ?? current.agentSource,
    ...(typeof payload.sessionFile === "string" ? { sessionFile: payload.sessionFile } : {}),
    ...(typeof payload.detached === "boolean" ? { detached: payload.detached } : {}),
    ...(task ? { task } : {}),
    ...(assignment !== undefined ? { assignment } : {}),
    ...(progress ? { progress } : {}),
    lastUpdate: now,
    source: "live",
  };
  // Progress frames arrive every ~150ms; skip the state churn when no displayed
  // field changed. `lastUpdate` is deliberately not compared: the host's
  // staleness fence follows the newest frame it actually re-rendered.
  if (
    current.agent === nextEntry.agent
    && current.agentSource === nextEntry.agentSource
    && current.sessionFile === nextEntry.sessionFile
    && current.detached === nextEntry.detached
    && current.task === nextEntry.task
    && current.assignment === nextEntry.assignment
    && JSON.stringify(current.progress) === JSON.stringify(nextEntry.progress)
  ) {
    return state;
  }
  const roster = [...state.roster];
  roster[target] = nextEntry;
  return { ...state, roster };
}

/** Record a child-session event: bump its transcript revision, append the
 * compact activity entry, and bound both id-keyed maps. */
function applyEvent(state: SubagentsState, payload: unknown, now: number): SubagentsState {
  if (!isRecord(payload)) return state;
  const id = asString(payload.id);
  if (!id) return state;
  const transcriptVersions = pruneIdMap({
    ...state.transcriptVersions,
    [id]: (state.transcriptVersions[id] ?? 0) + 1,
  });
  const activityEvent = parseSubagentActivityEvent(payload, now);
  let activity = state.activity;
  if (activityEvent) {
    const merged = [...(state.activity[id] ?? []), activityEvent];
    activity = pruneIdMap({
      ...state.activity,
      [id]: merged.length > ACTIVITY_MAX ? merged.slice(merged.length - ACTIVITY_MAX) : merged,
    });
  }
  return { roster: state.roster, activity, transcriptVersions };
}

/** Fold one live frame into the subagent state. Unknown frame types and
 * malformed payloads return the input state unchanged.
 *
 * `now` is the frame-stamping clock (wall clock by default); passing it keeps
 * the fold deterministic. */
export function reduceSubagents(
  state: SubagentsState,
  event: { type: string; payload?: unknown },
  now: number,
): SubagentsState {
  switch (event.type) {
    case "subagent_lifecycle": {
      const info = parseSubagentLifecycle(event.payload, now);
      if (!info) return state;
      return { ...state, roster: mergeRoster(state.roster, [info]) };
    }
    case "subagent_progress":
      return applyProgress(state, event.payload, now);
    case "subagent_event":
      return applyEvent(state, event.payload, now);
    default:
      return state;
  }
}

/** Roster entries still running. */
export function activeSubagentCount(state: SubagentsState): number {
  return state.roster.reduce((count, subagent) => (subagent.status === "started" ? count + 1 : count), 0);
}

/** Drop the whole subagent domain (roster, activity, transcript revisions). */
export function resetSubagents(_state: SubagentsState): SubagentsState {
  return EMPTY_SUBAGENTS;
}
