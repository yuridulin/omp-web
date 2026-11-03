import {
  MAX_SYNC_MESSAGES,
  historyCursor,
  paginateContext,
  parseHistoryCursor,
  selectHistoryRange,
  selectOlderRange,
  selectTailRange,
  type HistoryCursor,
  type HistoryRange,
} from "../core/history.ts";
import type { Snapshot } from "../core/machine";
import { SessionChangedWhileReadingError } from "./session-reader";
import type { SessionContext } from "./types";

export {
  MAX_SYNC_MESSAGES,
  historyCursor,
  parseHistoryCursor,
  selectHistoryRange,
  selectOlderRange,
  selectTailRange,
};

/** Durable display-history position, scoped to one session and selected view. */
export type SessionHistoryCursor = HistoryCursor;
/** Indexed page of entry ids; readers locate a cursor without rescanning the prefix. */
export type SessionHistoryRange = HistoryRange;

/** Ordering within one web-owned RPC process; resets when that process changes. */
export interface SessionStreamCursor {
  streamId: string;
  sequence: number;
}

export interface SessionHistoryPage {
  mode: "append" | "replace" | "prepend";
  baseEntryId: string | null;
  context: SessionContext;
  cursor: SessionHistoryCursor;
  hasMore: boolean;
  hasOlder: boolean;
}

export interface SessionSyncResponse extends SessionHistoryPage {
  sessionId: string;
  leafId: string | null;
  /** Authoritative core snapshot when a live wrapper exists. */
  snapshot: Snapshot | null;
}

/** Page the selected display path; an invalidated branch/compaction cursor resets it. */
export function selectSessionHistory(
  context: SessionContext,
  cursor: SessionHistoryCursor | null,
  limit = MAX_SYNC_MESSAGES,
): SessionHistoryPage {
  return paginateContext(context, cursor, limit);
}

/** Attempts for one page read that races omp's own session-file appends. */
export const HISTORY_READ_ATTEMPTS = 4;
/** Pause between retries; long enough for an append to finish, short enough
 * that a sync is not visibly delayed. */
export const HISTORY_READ_RETRY_MS = 12;

/**
 * Read a history page, retrying while omp appends to the session file.
 *
 * A page read validates the file version before and after seeking, so a message
 * settling mid-read throws. Surfacing that as HTTP 500 made the client drop the
 * sync; at the end of a run the last page — the answer — then stayed missing
 * until some later revision happened to arrive. The file is append-only, so
 * re-reading once the writer is done is the correct response.
 */
export async function readHistoryPageSettled<T>(read: () => T): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return read();
    } catch (error) {
      if (!(error instanceof SessionChangedWhileReadingError) || attempt + 1 >= HISTORY_READ_ATTEMPTS) throw error;
    }
    await retryDelay();
  }
}

function retryDelay(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, HISTORY_READ_RETRY_MS);
  return promise;
}
