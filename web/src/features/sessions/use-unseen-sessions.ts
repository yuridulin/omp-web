import { useEffect, useMemo, useState } from "react";
import type { SessionSummary } from "@/api/workspace";

/**
 * Read cursor for finished chats, kept per browser: a session shows a dot when
 * its last message is newer than the moment it was last on screen. The cursor
 * only covers sessions this client has observed; a session seen for the first
 * time records its current timestamp as read, so opening the app does not mark
 * every old chat unread.
 */

export type SeenSessions = Record<string, number>;

export const SEEN_STORAGE_KEY = "omp.seen.v1";

/** Epoch milliseconds of the session's last message, or 0 when unparseable. */
export function sessionActivityTime(session: SessionSummary): number {
  const time = Date.parse(session.lastMessageAt ?? session.modified);
  return Number.isFinite(time) ? time : 0;
}

/** Total parser for the persisted map; malformed entries are ignored. */
export function parseSeenSessions(raw: string | null): SeenSessions {
  if (!raw) return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const seen: SeenSessions = {};
  for (const [id, time] of Object.entries(value)) {
    if (typeof time === "number" && Number.isFinite(time)) seen[id] = time;
  }
  return seen;
}

/**
 * Next cursor: baseline every session seen for the first time, and keep moving
 * the open session's marker as its transcript grows. Returns null when nothing
 * changed, so a poll that brings no new messages does not rewrite storage.
 */
export function advanceSeenSessions(
  seen: SeenSessions,
  sessions: readonly SessionSummary[],
  selected: string | null,
): SeenSessions | null {
  let next: SeenSessions | null = null;
  for (const session of sessions) {
    const at = sessionActivityTime(session);
    const known = seen[session.id];
    const changed = session.id === selected
      ? at > (known ?? Number.NEGATIVE_INFINITY)
      : known === undefined;
    if (!changed) continue;
    next ??= { ...seen };
    next[session.id] = at;
  }
  return next;
}

/** Finished sessions with messages newer than their read cursor. */
export function unseenSessionIds(
  seen: SeenSessions,
  sessions: readonly SessionSummary[],
  running: ReadonlySet<string>,
  selected: string | null,
): string[] {
  const ids: string[] = [];
  for (const session of sessions) {
    if (session.id === selected || running.has(session.id)) continue;
    const viewed = seen[session.id];
    if (viewed !== undefined && sessionActivityTime(session) > viewed) ids.push(session.id);
  }
  return ids;
}

function readSeenSessions(): SeenSessions {
  try {
    return parseSeenSessions(globalThis.localStorage?.getItem(SEEN_STORAGE_KEY) ?? null);
  } catch {
    return {};
  }
}

function writeSeenSessions(seen: SeenSessions): void {
  try {
    globalThis.localStorage?.setItem(SEEN_STORAGE_KEY, JSON.stringify(seen));
  } catch {
    // Storage disabled: the in-memory cursor still drives this mount.
  }
}

export function useUnseenSessions(
  sessions: readonly SessionSummary[],
  running: ReadonlySet<string>,
  selected: string | null,
): ReadonlySet<string> {
  const [seen, setSeen] = useState(readSeenSessions);

  useEffect(() => {
    setSeen((previous) => {
      const next = advanceSeenSessions(previous, sessions, selected);
      if (next) writeSeenSessions(next);
      return next ?? previous;
    });
  }, [sessions, selected]);

  return useMemo(
    () => new Set(unseenSessionIds(seen, sessions, running, selected)),
    [seen, sessions, running, selected],
  );
}
