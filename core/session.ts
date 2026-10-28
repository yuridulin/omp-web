import type {
  AgentMessage,
  CompactionEntry,
  CustomMessage,
  SessionEntry,
  SessionTitleSource,
  SessionTreeNode,
  ToolCallContent,
} from "@/lib/types";
import { PASSIVE_TOOL_CONTEXT } from "./display";
import { asNumber, asString, isRecord } from "./guards";
import { todoPhasesFromEntries, type TodoPhase } from "./todos";

/**
 * Session files as a framework-free model: lenient JSONL parsing, the
 * fixed-width title slot, the entry tree, and the display context for one
 * leaf (branch walk, compaction collapsing, entry→message conversion).
 *
 * No file access and no caches: a host reads bytes and hands the lines in.
 * Mirrors omp's on-disk format, including entries this client does not render
 * (model changes, titles, injections) and hand-edited files with torn lines.
 */

// ---------------------------------------------------------------------------
// Fixed-width title slot (line 1)
// ---------------------------------------------------------------------------

export const SESSION_TITLE_SLOT_BYTES = 256;

export interface SessionTitleSlot {
  type: "title";
  v: 1;
  title: string;
  source?: SessionTitleSource;
  updatedAt: string;
  pad: string;
}

export interface SessionTitleUpdate {
  title?: string;
  source?: SessionTitleSource;
  updatedAt: string;
}

const utf8 = new TextEncoder();

function titleSlotLine(
  title: string,
  source: SessionTitleSource | undefined,
  updatedAt: string,
  pad: string,
): string {
  const slot: SessionTitleSlot = source
    ? { type: "title", v: 1, title, source, updatedAt, pad }
    : { type: "title", v: 1, title, updatedAt, pad };
  return `${JSON.stringify(slot)}\n`;
}

/** Longest code-point prefix of `title` whose serialized line fits the slot. */
function truncateTitleForSlot(
  title: string,
  source: SessionTitleSource | undefined,
  updatedAt: string,
): string {
  const codePoints = [...title];
  let low = 0;
  let high = codePoints.length;
  let best = "";
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const candidate = codePoints.slice(0, mid).join("");
    if (utf8.encode(titleSlotLine(candidate, source, updatedAt, "")).length <= SESSION_TITLE_SLOT_BYTES) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

function isSessionTitleSource(value: unknown): value is SessionTitleSource {
  return value === "auto" || value === "user";
}

/** Parse a physical title-slot JSONL line. Returns undefined for anything else. */
export function parseTitleSlotLine(line: string): SessionTitleSlot | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  if (value.type !== "title" || value.v !== 1) return undefined;
  if (typeof value.title !== "string" || typeof value.updatedAt !== "string" || typeof value.pad !== "string") {
    return undefined;
  }
  if (value.source !== undefined && !isSessionTitleSource(value.source)) return undefined;
  const slot: SessionTitleSlot = {
    type: "title",
    v: 1,
    title: value.title,
    updatedAt: value.updatedAt,
    pad: value.pad,
  };
  if (value.source) slot.source = value.source;
  return slot;
}

/** Parse the title slot out of the file's first read window (up to its newline). */
export function parseTitleSlotHead(head: string): SessionTitleSlot | undefined {
  const newlineIndex = head.indexOf("\n");
  if (newlineIndex < 0) return undefined;
  return parseTitleSlotLine(head.slice(0, newlineIndex));
}

/** Serialize the title slot to exactly 256 UTF-8 bytes including the newline. */
export function serializeTitleSlot(update: SessionTitleUpdate): string {
  const title = truncateTitleForSlot(update.title ?? "", update.source, update.updatedAt);
  const unpadded = titleSlotLine(title, update.source, update.updatedAt, "");
  const padBytes = SESSION_TITLE_SLOT_BYTES - utf8.encode(unpadded).length;
  if (padBytes < 0) throw new Error("Session title slot metadata exceeds fixed slot size");
  const line = titleSlotLine(title, update.source, update.updatedAt, " ".repeat(padBytes));
  if (utf8.encode(line).length !== SESSION_TITLE_SLOT_BYTES) {
    throw new Error("Session title slot serialization failed to produce fixed-width output");
  }
  return line;
}

// ---------------------------------------------------------------------------
// Lenient JSONL parsing
// ---------------------------------------------------------------------------

/**
 * JSON.stringify never emits raw newlines, so line splitting is a faithful
 * lenient JSONL parse: malformed/truncated lines are skipped, not fatal.
 */
export function parseJsonlLenient<T>(body: string): T[] {
  const out: T[] = [];
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      // Skip malformed line (torn write, prefix-window truncation).
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Entry tree
// ---------------------------------------------------------------------------

/** Label entries fold onto their target; a cleared label removes the name. */
export function buildSessionTree(entries: SessionEntry[]): SessionTreeNode[] {
  const labels = new Map<string, string>();
  for (const entry of entries) {
    if (entry.type !== "label") continue;
    if (entry.label) labels.set(entry.targetId, entry.label);
    else labels.delete(entry.targetId);
  }

  const nodes = new Map<string, SessionTreeNode>();
  const roots: SessionTreeNode[] = [];
  for (const entry of entries) {
    nodes.set(entry.id, { entry, children: [], label: labels.get(entry.id) });
  }
  for (const entry of entries) {
    const node = nodes.get(entry.id)!;
    if (entry.parentId === null || entry.parentId === entry.id) {
      roots.push(node);
      continue;
    }
    const parent = nodes.get(entry.parentId);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const byTimestamp = (a: SessionTreeNode, b: SessionTreeNode) =>
    new Date(a.entry.timestamp).getTime() - new Date(b.entry.timestamp).getTime();
  const stack = [...roots];
  while (stack.length > 0) {
    const node = stack.pop()!;
    node.children.sort(byTimestamp);
    stack.push(...node.children);
  }
  return roots;
}

/** The persisted leaf: the last appended entry (matches omp's loaded-session leaf). */
export function getLeafEntryId(entries: SessionEntry[]): string | null {
  return entries.length > 0 ? entries[entries.length - 1].id : null;
}

// ---------------------------------------------------------------------------
// Tool-call normalization
// ---------------------------------------------------------------------------

function normalizeToolCallBlock(block: unknown): ToolCallContent | null {
  if (!isRecord(block) || block.type !== "toolCall") return null;
  const input = block.input ?? block.arguments;
  return {
    type: "toolCall",
    toolCallId: typeof block.toolCallId === "string" ? block.toolCallId : (typeof block.id === "string" ? block.id : ""),
    toolName: typeof block.toolName === "string" ? block.toolName : (typeof block.name === "string" ? block.name : ""),
    input: isRecord(input) ? input : {},
  };
}

/**
 * Sessions store toolCall blocks as `{id, name, arguments}`, while the client
 * model uses `{toolCallId, toolName, input}`. Only assistant messages carry
 * tool calls; every other message is returned unchanged.
 */
export function normalizeToolCalls(message: AgentMessage): AgentMessage {
  if (message.role !== "assistant") return message;
  const content = message.content;
  if (!Array.isArray(content)) return message;
  let changed = false;
  const normalized = content.map((block) => {
    const result = normalizeToolCallBlock(block);
    if (!result) return block;
    const raw = block as unknown as Record<string, unknown>;
    if (raw.toolCallId !== result.toolCallId || raw.toolName !== result.toolName || raw.input !== result.input) {
      changed = true;
      return result;
    }
    return block;
  });
  return changed ? { ...message, content: normalized } : message;
}

// ---------------------------------------------------------------------------
// Bounded tool-result details
// ---------------------------------------------------------------------------

const TASK_DETAIL_MAX_TEXT = 240;
const TASK_DETAIL_MAX_ROWS = 50;

function truncateTaskDetailText(value: string): string {
  if (value.length <= TASK_DETAIL_MAX_TEXT) return value;
  // Cut by code point so a boundary can never split a surrogate pair.
  return `${[...value].slice(0, TASK_DETAIL_MAX_TEXT).join("")}…`;
}

function taskResultUsageCost(usage: unknown): number | undefined {
  if (!isRecord(usage) || !isRecord(usage.cost)) return undefined;
  const total = asNumber(usage.cost.total);
  if (total !== undefined) return total;
  const input = asNumber(usage.cost.input);
  const output = asNumber(usage.cost.output);
  return input !== undefined && output !== undefined ? input + output : undefined;
}

function taskDetailAsync(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, string> = {};
  for (const key of ["state", "jobId", "type"] as const) {
    const text = asString(value[key]);
    if (text !== undefined) out[key] = truncateTaskDetailText(text);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const TASK_DETAIL_PROGRESS_KEYS = [
  "index", "id", "agent", "agentSource", "status", "task", "assignment", "lastIntent",
  "toolCount", "requests", "tokens", "contextTokens", "contextWindow", "cost", "durationMs",
  "modelRole", "resolvedModel", "resolvedModelIsFallback", "retryFailure",
] as const;

const TASK_DETAIL_RESULT_KEYS = [
  "index", "id", "agent", "agentSource", "status", "task", "assignment", "exitCode",
  "truncated", "structuredOutput", "durationMs", "tokens", "requests", "contextTokens",
  "contextWindow", "modelRole", "resolvedModel", "resolvedModelIsFallback", "error",
  "aborted", "abortReason", "outputPath", "patchPath", "branchName", "retryFailure",
] as const;

const DETAIL_TEXT_KEYS = [
  "task", "assignment", "error", "abortReason", "lastIntent", "agent", "modelRole",
  "resolvedModel", "outputPath", "patchPath", "branchName",
] as const;

function keepTaskToolResultDetails(details: Record<string, unknown>): Record<string, unknown> | null {
  const kept: Record<string, unknown> = {};
  const results = Array.isArray(details.results) ? details.results : [];
  const progress = Array.isArray(details.progress) ? details.progress : [];
  if (results.length === 0 && progress.length === 0 && !isRecord(details.async)) return null;

  if (typeof details.totalDurationMs === "number") kept.totalDurationMs = details.totalDurationMs;
  if (isRecord(details.async)) {
    const asyncInfo = taskDetailAsync(details.async);
    if (asyncInfo) kept.async = asyncInfo;
  }

  const pickRecord = (raw: unknown, keys: readonly string[]): Record<string, unknown> | null => {
    if (!isRecord(raw)) return null;
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      if (raw[key] !== undefined) out[key] = raw[key];
    }
    // Bound every string field that rides the history payload.
    for (const key of DETAIL_TEXT_KEYS) {
      const text = out[key];
      if (typeof text === "string") out[key] = truncateTaskDetailText(text);
    }
    // Settled results carry cost in `usage.cost`, not top-level `cost`.
    if (typeof out.cost !== "number") {
      const usageCost = taskResultUsageCost(raw.usage);
      if (usageCost !== undefined) out.cost = usageCost;
    }
    // Project nested objects to bounded, UI-only shapes.
    if (raw.retryFailure !== undefined) {
      const retryFailure = isRecord(raw.retryFailure)
        ? projectRetryFailure(raw.retryFailure)
        : undefined;
      if (retryFailure) out.retryFailure = retryFailure;
      else delete out.retryFailure;
    }
    if (raw.structuredOutput !== undefined) {
      const structuredOutput = isRecord(raw.structuredOutput)
        ? projectStructuredOutput(raw.structuredOutput)
        : undefined;
      if (structuredOutput) out.structuredOutput = structuredOutput;
      else delete out.structuredOutput;
    }
    return out;
  };

  if (progress.length > 0) {
    kept.progress = progress
      .slice(0, TASK_DETAIL_MAX_ROWS)
      .map((raw) => pickRecord(raw, TASK_DETAIL_PROGRESS_KEYS))
      .filter((entry): entry is Record<string, unknown> => entry !== null);
  }
  if (results.length > 0) {
    kept.results = results
      .slice(0, TASK_DETAIL_MAX_ROWS)
      .map((raw) => pickRecord(raw, TASK_DETAIL_RESULT_KEYS))
      .filter((entry): entry is Record<string, unknown> => entry !== null);
  }
  return Object.keys(kept).length > 0 ? kept : null;
}

/** Retry telemetry: both fields must be present, or the shape is ignored. */
function projectRetryFailure(value: unknown): { attempt: number; errorMessage: string } | undefined {
  if (!isRecord(value)) return undefined;
  const attempt = asNumber(value.attempt);
  const errorMessage = asString(value.errorMessage);
  if (attempt === undefined || errorMessage === undefined) return undefined;
  return { attempt, errorMessage: truncateTaskDetailText(errorMessage) };
}

/** Project a `structuredOutput` payload to its documented UI fields only —
 * `data` is arbitrary upstream payload and must never ride bounded responses. */
function projectStructuredOutput(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, string> = {};
  for (const key of ["source", "mode", "status", "error"] as const) {
    const text = asString(value[key]);
    if (text !== undefined) out[key] = truncateTaskDetailText(text);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function keepHubToolResultDetails(details: Record<string, unknown>): Record<string, unknown> | null {
  const op = details.op;
  if (typeof op !== "string" || (op !== "send" && op !== "jobs")) return null;
  const kept: Record<string, unknown> = { op };
  if (op === "send") {
    const to = hubDetailTargets(details.to);
    if (to) kept.to = to;
    if (Array.isArray(details.receipts)) {
      const receipts = details.receipts
        .slice(0, TASK_DETAIL_MAX_ROWS)
        .map((raw) => {
          if (!isRecord(raw)) return null;
          const out: Record<string, string> = {};
          if (typeof raw.to === "string") out.to = truncateTaskDetailText(raw.to);
          if (typeof raw.outcome === "string") out.outcome = truncateTaskDetailText(raw.outcome);
          return Object.keys(out).length > 0 ? out : null;
        })
        .filter((entry): entry is Record<string, string> => entry !== null);
      if (receipts.length > 0) kept.receipts = receipts;
    }
  } else if (Array.isArray(details.jobs)) {
    const jobs = details.jobs
      .slice(0, TASK_DETAIL_MAX_ROWS)
      .map((raw) => {
        if (!isRecord(raw)) return null;
        const out: Record<string, unknown> = {};
        for (const key of ["id", "type", "status", "label", "resolvedModel"] as const) {
          if (typeof raw[key] === "string") out[key] = truncateTaskDetailText(raw[key]);
        }
        if (typeof raw.durationMs === "number" && Number.isFinite(raw.durationMs)) out.durationMs = raw.durationMs;
        return Object.keys(out).length > 0 ? out : null;
      })
      .filter((entry): entry is Record<string, unknown> => entry !== null);
    if (jobs.length > 0) kept.jobs = jobs;
  }
  return Object.keys(kept).length > 1 ? kept : null;
}

function hubDetailTargets(value: unknown): string[] | undefined {
  const list = Array.isArray(value) ? value : typeof value === "string" ? [value] : undefined;
  if (!list) return undefined;
  const out = list
    .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    .slice(0, TASK_DETAIL_MAX_ROWS)
    .map((entry) => truncateTaskDetailText(entry));
  return out.length > 0 ? out : undefined;
}

/**
 * `details` is provider/tool-internal metadata that dominates history
 * payloads. The history UI reads `patch`/`diff`, the per-subagent summary on
 * `task`, and the hub job/receipt rows; everything else is dropped. On-disk
 * parsing keeps full details — only the display path narrows them.
 */
function stripToolResultDetails(message: AgentMessage): AgentMessage {
  if (message.role !== "toolResult" || message.details === undefined) return message;
  const { details, ...rest } = message;
  if (isRecord(details)) {
    const kept: Record<string, unknown> = {};
    if (typeof details.patch === "string") kept.patch = details.patch;
    if (typeof details.diff === "string") kept.diff = details.diff;
    if (message.toolName === "task") {
      const taskDetails = keepTaskToolResultDetails(details);
      if (taskDetails) Object.assign(kept, taskDetails);
    }
    if (message.toolName === "hub") {
      const hubDetails = keepHubToolResultDetails(details);
      if (hubDetails) Object.assign(kept, hubDetails);
    }
    if (Object.keys(kept).length > 0) return { ...rest, details: kept };
  }
  return rest;
}

// ---------------------------------------------------------------------------
// Entry → display message
// ---------------------------------------------------------------------------

function parseEntryTimestamp(timestamp: string): number | undefined {
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** Message-level timestamps arrive as epoch numbers on the wire but ISO
 *  strings in hand-edited/imported files — normalize both to number|undefined
 *  so downstream arithmetic never sees a string (NaN / Invalid Date). */
function normalizeMessageTimestamp(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return parseEntryTimestamp(value);
  return undefined;
}

/** Pass-through branches return the raw message — repair only its timestamp, copying when needed. */
function withNormalizedTimestamp(message: AgentMessage): AgentMessage {
  // External files can carry a string here even though the type says number.
  const raw: unknown = (message as { timestamp?: unknown }).timestamp;
  const timestamp = normalizeMessageTimestamp(raw);
  return timestamp === raw ? message : { ...message, timestamp };
}

/** `content` of a developer/custom message; malformed shapes degrade to text. */
function customContent(value: unknown): CustomMessage["content"] {
  if (typeof value === "string") return value;
  return Array.isArray(value) ? (value as CustomMessage["content"]) : "";
}

export const SUPERSEDED_COMPACTION_SUMMARY = "[Superseded compaction summary elided after a newer compaction]";

/** The display row for a compaction summary; only the active one shows its text. */
export function compactionUiMessage(entry: CompactionEntry, active: boolean): CustomMessage {
  return {
    role: "custom",
    customType: "compaction",
    content: active ? entry.summary : SUPERSEDED_COMPACTION_SUMMARY,
    display: true,
    details: {
      tokensBefore: entry.tokensBefore,
      ...(entry.tokensAfter !== undefined ? { tokensAfter: entry.tokensAfter } : {}),
      ...(entry.method !== undefined ? { method: entry.method } : {}),
      firstKeptEntryId: entry.firstKeptEntryId,
    },
    timestamp: parseEntryTimestamp(entry.timestamp),
  };
}

export interface EntryDisplayOptions {
  /** Replace non-empty thinking bodies with a `deferred` placeholder. */
  deferThinking?: boolean;
  /**
   * Host-provided transform for tool-result images (e.g. base64 → media URL).
   * Without it images stay inline.
   */
  toolResultImages?: (message: AgentMessage) => AgentMessage;
}

/**
 * Convert a session entry on the active branch into a display message.
 *
 * omp-only roles are folded into custom messages so a role-keyed client
 * renders them without new message types. Returns null for entries that carry
 * no chat history (model changes, titles, injections, ...).
 */
export function entryToUiMessage(
  entry: SessionEntry,
  options: EntryDisplayOptions = {},
): AgentMessage | null {
  switch (entry.type) {
    case "message": {
      // Imports and hand-edits can produce message entries whose body is
      // missing; skip them instead of crashing every reader of the file.
      if (!isRecord(entry.message)) return null;
      const raw = entry.message;
      // omp-only roles become displayable custom messages.
      if (raw.role === "developer") {
        // Passive tool context is display-only: it rides on its tool card,
        // never as a row or in copied transcripts.
        const passive = raw.passiveToolContext === true;
        return {
          role: "custom",
          customType: passive ? PASSIVE_TOOL_CONTEXT : "developer",
          content: customContent(raw.content),
          display: !passive,
          timestamp: normalizeMessageTimestamp(raw.timestamp),
        };
      }
      if (raw.role === "pythonExecution") {
        const code = typeof raw.code === "string" ? raw.code : "";
        const output = raw.output ? `\n\`\`\`\n${String(raw.output)}\n\`\`\`` : "\n(no output)";
        const status = raw.cancelled
          ? "\n(execution cancelled)"
          : raw.exitCode ? `\nExecution failed with code ${String(raw.exitCode)}` : "";
        return {
          role: "custom",
          customType: "python-execution",
          content: `Ran Python:\n\`\`\`python\n${code}\n\`\`\`${output}${status}`,
          display: true,
          timestamp: normalizeMessageTimestamp(raw.timestamp),
        };
      }
      if (raw.role === "fileMention") {
        // Guard against shape-malformed entries (missing/non-array `files`)
        // the same way the loader tolerates bad lines.
        const paths = Array.isArray(raw.files)
          ? raw.files.flatMap((file) => (isRecord(file) && typeof file.path === "string" ? [file.path] : []))
          : [];
        return {
          role: "custom",
          customType: "file-mention",
          content: `Attached file${paths.length === 1 ? "" : "s"}:\n${paths.map((path) => `- ${path}`).join("\n")}`,
          display: true,
          timestamp: normalizeMessageTimestamp(raw.timestamp),
        };
      }
      const normalized = normalizeToolCalls(raw);
      const message = stripToolResultDetails(options.toolResultImages ? options.toolResultImages(normalized) : normalized);
      if (!options.deferThinking || message.role !== "assistant") return withNormalizedTimestamp(message);
      // A string-content assistant entry must not crash the context route.
      if (!Array.isArray(message.content)) return withNormalizedTimestamp(message);
      return withNormalizedTimestamp({
        ...message,
        content: message.content.map((block) => (
          block.type === "thinking" && typeof block.thinking === "string" && block.thinking.trim() !== ""
            ? { ...block, thinking: "", deferred: true }
            : block
        )),
      });
    }
    case "branch_summary":
      if (!entry.summary) return null;
      return {
        role: "user",
        content: `*The conversation briefly explored another branch and returned with this summary:*\n\n${entry.summary}`,
        timestamp: parseEntryTimestamp(entry.timestamp),
        branchSummary: true,
      };
    case "custom_message":
      return {
        role: "custom",
        customType: entry.customType,
        content: entry.content,
        display: entry.display,
        details: entry.details,
        timestamp: parseEntryTimestamp(entry.timestamp),
      };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Branch selection and display context
// ---------------------------------------------------------------------------

export interface SessionContextOptions extends EntryDisplayOptions {
  /** Show the full branch including entries collapsed by the active compaction. */
  includePreCompaction?: boolean;
}

export interface SessionContextView {
  messages: AgentMessage[];
  /** Parallel to `messages`: the session entry id for each row. */
  entryIds: string[];
  thinkingLevel: string;
  model: { provider: string; modelId: string } | null;
  todoPhases: TodoPhase[];
}

interface SelectedBranch {
  selected: SessionEntry[];
  compactionId: string | null;
  thinkingLevel: string;
  model: SessionContextView["model"];
  todoPhases: TodoPhase[];
}

export function buildSessionContext(
  entries: SessionEntry[],
  leafId?: string | null,
  options: SessionContextOptions = {},
): SessionContextView {
  const { selected, compactionId, thinkingLevel, model, todoPhases } = selectSessionContext(entries, leafId, options);
  return {
    messages: selected.map((entry) => entry.type === "compaction"
      ? compactionUiMessage(entry, entry.id === compactionId)
      : entryToUiMessage(entry, options)!),
    entryIds: selected.map((entry) => entry.id),
    thinkingLevel,
    model,
    todoPhases,
  };
}

/**
 * Select ordering and branch metadata without converting message bodies.
 *
 * Port of omp's `buildSessionContext` path-walk semantics: leaf→root walk with
 * a cycle guard, `firstKeptEntryId` compaction collapsing, role-based model
 * tracking with legacy assistant-message inference.
 */
export function selectSessionContext(
  entries: SessionEntry[],
  leafId?: string | null,
  options: { includePreCompaction?: boolean } = {},
): SelectedBranch {
  const empty: SelectedBranch = {
    selected: [],
    compactionId: null,
    thinkingLevel: "off",
    model: null,
    todoPhases: [],
  };
  const byId = new Map<string, SessionEntry>();
  for (const entry of entries) byId.set(entry.id, entry);
  if (leafId === null) return empty;
  const leaf = (leafId ? byId.get(leafId) : undefined) ?? entries.at(-1);
  if (!leaf) return empty;

  // Walk leaf → root, stopping at the first corrupt parent cycle.
  const path: SessionEntry[] = [];
  const seen = new Set<string>();
  let current: SessionEntry | undefined = leaf;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.push(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  path.reverse();

  let thinkingLevel = "off";
  const models: Record<string, string> = {};
  // Explicit defaults take precedence over temporary assistant fallbacks.
  let hasExplicitDefaultModel = false;
  let compaction: CompactionEntry | null = null;
  for (const entry of path) {
    if (entry.type === "thinking_level_change") {
      thinkingLevel = entry.thinkingLevel ?? "off";
    } else if (entry.type === "model_change") {
      if (entry.model) {
        const role = entry.role ?? "default";
        models[role] = entry.model;
        if (role === "default") hasExplicitDefaultModel = true;
      } else if (entry.provider && entry.modelId) {
        models.default = `${entry.provider}/${entry.modelId}`;
        hasExplicitDefaultModel = true;
      }
    } else if (entry.type === "message" && isRecord(entry.message) && entry.message.role === "assistant") {
      if (!hasExplicitDefaultModel && entry.message.provider && entry.message.model) {
        models.default = `${entry.message.provider}/${entry.message.model}`;
      }
    } else if (entry.type === "compaction") {
      compaction = entry;
    }
  }

  const selected: SessionEntry[] = [];
  const appendEntry = (entry: SessionEntry) => {
    if (entry.type === "compaction" || entry.type === "custom_message"
      || (entry.type === "message" && isRecord(entry.message))
      || (entry.type === "branch_summary" && entry.summary)) {
      selected.push(entry);
    }
  };
  if (compaction && !options.includePreCompaction) {
    const activeCompaction = compaction;
    appendEntry(activeCompaction);
    const compactionIdx = path.findIndex((entry) => entry.type === "compaction" && entry.id === activeCompaction.id);
    let foundFirstKept = false;
    for (let i = 0; i < compactionIdx; i++) {
      const entry = path[i];
      if (entry.id === activeCompaction.firstKeptEntryId) foundFirstKept = true;
      if (foundFirstKept) appendEntry(entry);
    }
    for (let i = compactionIdx + 1; i < path.length; i++) appendEntry(path[i]);
  } else {
    for (const entry of path) appendEntry(entry);
  }

  let model: SessionContextView["model"] = null;
  const defaultModel = models.default;
  if (defaultModel) {
    const separator = defaultModel.indexOf("/");
    model = separator > 0
      ? { provider: defaultModel.slice(0, separator), modelId: defaultModel.slice(separator + 1) }
      : { provider: "", modelId: defaultModel };
  }
  const phases = todoPhasesFromEntries(entries, leafId);
  return {
    selected,
    compactionId: compaction?.id ?? null,
    thinkingLevel,
    model,
    todoPhases: phases.map((phase) => ({ name: phase.name, tasks: phase.tasks.map((task) => ({ ...task })) })),
  };
}
