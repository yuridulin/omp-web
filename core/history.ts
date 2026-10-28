import type { AgentMessage } from "./types";
import { isRecord } from "./guards";
import type { WireEvent } from "./protocol";

/**
 * Pure history reconciliation and live-merge planning.
 *
 * The transport delivers two independent sources for the same transcript: disk
 * pages (`/context`) and live frames. This module decides which of them may
 * overwrite which, using only data — no fetch, no timers, no DOM.
 */

export interface HistoryCursor {
  firstEntryId: string | null;
  lastEntryId: string | null;
}

export interface HistoryPage {
  mode: string;
  baseEntryId: string | null;
  context: { messages: AgentMessage[]; entryIds: string[] };
  cursor: HistoryCursor;
  hasMore: boolean;
}

export interface HistoryView {
  messages: AgentMessage[];
  entryIds: string[];
  cursor: HistoryCursor;
}

export type PageOutcome =
  | { ok: true; view: HistoryView; next: "more" | "done" | "stalled" }
  | { ok: false; reason: "invalid_mode" | "length_mismatch" | "base_mismatch" };

/**
 * Merge one disk page into the current view.
 *
 * `append` must line up with the cursor the view ends on; anything else is a
 * malformed or out-of-order read and is rejected instead of silently splicing
 * the transcript. `replace` drops the view entirely.
 */
export function reconcilePage(previous: HistoryView | null, page: HistoryPage): PageOutcome {
  if (page.mode !== "append" && page.mode !== "replace") {
    return { ok: false, reason: "invalid_mode" };
  }
  if (page.context.messages.length !== page.context.entryIds.length) {
    return { ok: false, reason: "length_mismatch" };
  }
  if (page.mode === "append" && page.baseEntryId !== (previous?.cursor.lastEntryId ?? null)) {
    return { ok: false, reason: "base_mismatch" };
  }

  const messages = page.mode === "append" ? [...(previous?.messages ?? [])] : [];
  const entryIds = page.mode === "append" ? [...(previous?.entryIds ?? [])] : [];
  const seen = new Set(entryIds);
  for (let index = 0; index < page.context.entryIds.length; index += 1) {
    const entryId = page.context.entryIds[index];
    if (seen.has(entryId)) continue;
    seen.add(entryId);
    entryIds.push(entryId);
    messages.push(page.context.messages[index]);
  }

  const view: HistoryView = { messages, entryIds, cursor: page.cursor };
  return { ok: true, view, next: progress(page, previous?.cursor ?? null) };
}

/** Whether another page should be requested after this one. */
function progress(page: HistoryPage, previousCursor: HistoryCursor | null): "more" | "done" | "stalled" {
  if (!page.hasMore) return "done";
  const unchanged = previousCursor?.firstEntryId === page.cursor.firstEntryId
    && previousCursor?.lastEntryId === page.cursor.lastEntryId;
  return unchanged ? "stalled" : "more";
}

/** Sequence floors per event family; live frames below a floor are stale. */
export interface LiveFloors {
  message: number;
  lifecycle: number;
  toolsSnapshot: number;
  latestTool: number;
  tools: ReadonlyMap<string, number>;
}

export interface LiveCursor {
  streamId: string;
  sequence: number;
}

export interface LiveSnapshot {
  cursor: LiveCursor;
  isStreaming: boolean;
  isPromptRunning: boolean;
  isCompacting: boolean;
  streamingMessage: Partial<AgentMessage> | null;
  toolEvents: unknown[];
}

export interface LiveMergeFields {
  message: boolean;
  lifecycle: boolean;
  /** Null rejects tool hydration; otherwise keep the listed newer tool ids. */
  tools: ReadonlySet<string> | null;
}

export interface LiveMergePlan {
  fields: LiveMergeFields;
  floors: LiveFloors;
  streamSequence: number;
}

export function emptyFloors(): LiveFloors {
  return { message: 0, lifecycle: 0, toolsSnapshot: 0, latestTool: 0, tools: new Map() };
}

/**
 * Decide which live fields a disk read may overwrite.
 *
 * A snapshot older than a frame this client already applied must not roll the
 * UI back, so each family carries its own floor; tools are tracked per call id.
 */
export function planLiveMerge(
  floors: LiveFloors,
  streamSequence: number,
  live: LiveSnapshot,
): LiveMergePlan {
  const sequence = live.cursor.sequence;
  const busy = live.isStreaming || live.isPromptRunning || live.isCompacting;
  const keepNewerTools = live.cursor.sequence >= Math.max(floors.toolsSnapshot, floors.lifecycle);

  const acceptedTools = new Set<string>();
  const tools = new Map(floors.tools);
  const fields: LiveMergeFields = {
    message: sequence >= Math.max(floors.message, floors.lifecycle),
    lifecycle: sequence >= floors.lifecycle
      && (busy || sequence >= Math.max(floors.message, floors.latestTool)),
    tools: keepNewerTools ? acceptedTools : null,
  };

  const next: LiveFloors = {
    message: fields.message ? sequence : floors.message,
    lifecycle: fields.lifecycle ? sequence : floors.lifecycle,
    toolsSnapshot: floors.toolsSnapshot,
    latestTool: floors.latestTool,
    tools,
  };

  if (keepNewerTools) {
    for (const [toolCallId, seen] of floors.tools) {
      if (seen > sequence) acceptedTools.add(toolCallId);
      else tools.delete(toolCallId);
    }
    next.toolsSnapshot = sequence;
    next.latestTool = Math.max(next.latestTool, sequence);
  }

  return {
    fields,
    floors: next,
    streamSequence: Math.max(streamSequence, sequence),
  };
}

const LIFECYCLE = /^(agent_start|agent_end|prompt_result|prompt_error|auto_compaction_start|auto_compaction_end)$/;
const MESSAGE = /^(message_start|message_update|message_end)$/;
const TOOL = /^tool_execution_(start|update|end)$/;

export type EventFamily = "lifecycle" | "message" | "tool" | "other";

export function classifyEvent(event: WireEvent): { family: EventFamily; toolCallId: string | null } {
  if (LIFECYCLE.test(event.type)) return { family: "lifecycle", toolCallId: null };
  if (MESSAGE.test(event.type) && (event.message as { role?: unknown } | undefined)?.role !== "user") {
    return { family: "message", toolCallId: null };
  }
  if (TOOL.test(event.type) && typeof event.toolCallId === "string") {
    return { family: "tool", toolCallId: event.toolCallId };
  }
  return { family: "other", toolCallId: null };
}

export interface EventAdvance {
  stale: boolean;
  floors: LiveFloors;
  streamSequence: number;
}

/**
 * Ordering gate for one live frame.
 *
 * Receipt is observed before token coalescing, so a coalesced token can never
 * make a later HTTP read look fresher than it is.
 */
export function advanceFloors(
  floors: LiveFloors,
  streamSequence: number,
  event: WireEvent,
  sequence: number,
): EventAdvance {
  const { family, toolCallId } = classifyEvent(event);
  const floor = family === "lifecycle"
    ? Math.max(floors.lifecycle, floors.message, floors.latestTool)
    : family === "message"
      ? Math.max(floors.lifecycle, floors.message)
      : family === "tool"
        ? Math.max(floors.lifecycle, floors.toolsSnapshot, floors.tools.get(toolCallId ?? "") ?? 0)
        : 0;

  if (sequence < floor) return { stale: true, floors, streamSequence };

  const tools = family === "lifecycle" ? new Map<string, number>() : new Map(floors.tools);
  const next: LiveFloors = { ...floors, tools };
  if (family === "lifecycle") next.lifecycle = sequence;
  if (family === "message") next.message = sequence;
  if (family === "tool" && toolCallId) {
    tools.set(toolCallId, sequence);
    next.latestTool = Math.max(next.latestTool, sequence);
  }

  return { stale: false, floors: next, streamSequence: Math.max(streamSequence, sequence) };
}

// ---------------------------------------------------------------------------
// Display-history paging
// ---------------------------------------------------------------------------

/**
 * Durable display-history position, scoped to one session and selected view.
 * A cursor never authorizes a session or a file path: it only names entry ids.
 */
export const MAX_SYNC_MESSAGES = 200;

export function historyCursor(context: { entryIds: readonly string[] }): HistoryCursor {
  return {
    firstEntryId: context.entryIds[0] ?? null,
    lastEntryId: context.entryIds.at(-1) ?? null,
  };
}

/** Decode only bounded IDs; anything else is a malformed client request. */
export function parseHistoryCursor(raw: string | null): HistoryCursor | null {
  if (raw === null) return null;
  if (raw.length > 2048) throw new Error("Invalid history cursor");
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value)) throw new Error("Invalid history cursor");
  const validId = (id: unknown): id is string | null =>
    id === null || (typeof id === "string" && id.length > 0 && id.length <= 256);
  if (!validId(value.firstEntryId) || !validId(value.lastEntryId)
    || (value.firstEntryId === null) !== (value.lastEntryId === null)) {
    throw new Error("Invalid history cursor");
  }
  return { firstEntryId: value.firstEntryId, lastEntryId: value.lastEntryId };
}

export interface HistoryRange {
  mode: "append" | "replace";
  baseEntryId: string | null;
  start: number;
  end: number;
  cursor: HistoryCursor;
  hasMore: boolean;
}

/**
 * Page the selected display path. A cursor that no longer lines up with the
 * current prefix (a branch switch, a new compaction) resets the page instead
 * of appending unrelated entries. `positions` lets an indexed reader locate
 * the cursor without scanning the delivered prefix again.
 */
export function selectHistoryRange(
  entryIds: readonly string[],
  cursor: HistoryCursor | null,
  limit = MAX_SYNC_MESSAGES,
  positions?: ReadonlyMap<string, number>,
): HistoryRange {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SYNC_MESSAGES) throw new RangeError("Invalid history page limit");
  const firstEntryId = entryIds[0] ?? null;
  const cursorIndex = cursor?.lastEntryId
    ? positions ? positions.get(cursor.lastEntryId) ?? -1 : entryIds.indexOf(cursor.lastEntryId)
    : -1;
  const append = cursor !== null && cursor.firstEntryId === firstEntryId
    && ((cursorIndex >= 0 && entryIds[cursorIndex] === cursor.lastEntryId) || (cursor.lastEntryId === null && entryIds.length === 0));
  const start = append ? cursorIndex + 1 : 0;
  const end = Math.min(start + limit, entryIds.length);
  return {
    mode: append ? "append" : "replace",
    baseEntryId: append ? cursor.lastEntryId : null,
    start,
    end,
    cursor: { firstEntryId, lastEntryId: entryIds[end - 1] ?? null },
    hasMore: end < entryIds.length,
  };
}

export interface HistoryPageSlice<T> {
  mode: "append" | "replace";
  baseEntryId: string | null;
  context: T;
  cursor: HistoryCursor;
  hasMore: boolean;
}

/** Slice a built context (`messages`/`entryIds` stay parallel) to one page. */
export function paginateContext<T extends { messages: AgentMessage[]; entryIds: string[] }>(
  context: T,
  cursor: HistoryCursor | null,
  limit = MAX_SYNC_MESSAGES,
): HistoryPageSlice<T> {
  const { start, end, ...page } = selectHistoryRange(context.entryIds, cursor, limit);
  return {
    ...page,
    context: {
      ...context,
      messages: context.messages.slice(start, end),
      entryIds: context.entryIds.slice(start, end),
    },
  };
}
