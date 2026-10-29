import {
  MAX_SYNC_MESSAGES,
  historyCursor,
  paginateContext,
  parseHistoryCursor,
  selectHistoryRange,
  type HistoryCursor,
  type HistoryRange,
} from "../core/history.ts";
import type { Snapshot } from "../core/machine";
import type { AgentMessage, SessionContext } from "./types";

export { MAX_SYNC_MESSAGES, historyCursor, parseHistoryCursor, selectHistoryRange };

/** Durable display-history position, scoped to one session and selected view. */
export type SessionHistoryCursor = HistoryCursor;
/** Indexed page of entry ids; readers locate a cursor without rescanning the prefix. */
export type SessionHistoryRange = HistoryRange;

/** Ordering within one web-owned RPC process; resets when that process changes. */
export interface SessionStreamCursor {
  streamId: string;
  sequence: number;
}

export interface SessionLiveToolEvent {
  type: "tool_execution_start" | "tool_execution_update";
  toolCallId: string;
  [key: string]: unknown;
}

export interface SessionLiveSnapshot {
  cursor: SessionStreamCursor;
  isStreaming: boolean;
  isPromptRunning: boolean;
  isCompacting: boolean;
  streamingMessage: Partial<AgentMessage> | null;
  toolEvents: SessionLiveToolEvent[];
  /** Positive run-scoped evidence survives message_end's delayed file write. */
  responseObserved?: boolean;
}

export interface SessionHistoryPage {
  mode: "append" | "replace";
  baseEntryId: string | null;
  context: SessionContext;
  cursor: SessionHistoryCursor;
  hasMore: boolean;
}

export interface SessionSyncResponse extends SessionHistoryPage {
  sessionId: string;
  leafId: string | null;
  /** Null for a file-only session or a view pinned to a historical branch. */
  live: SessionLiveSnapshot | null;
  /** Authoritative core snapshot when a live wrapper exists. */
  snapshot?: Snapshot | null;
}

/** Page the selected display path; an invalidated branch/compaction cursor resets it. */
export function selectSessionHistory(
  context: SessionContext,
  cursor: SessionHistoryCursor | null,
  limit = MAX_SYNC_MESSAGES,
): SessionHistoryPage {
  return paginateContext(context, cursor, limit);
}
