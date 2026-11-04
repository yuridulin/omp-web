/**
 * Pure derivation for a session rail: project grouping, recency order, search
 * matching, the running filter, the inactivity split into a group's `older`
 * rows, and relative time labels. No React and no skin imports, so any rail
 * presentation can consume the same view.
 */

import { basename, comparablePath } from "@/api/paths";
import type { ProjectSummary, SessionSummary } from "@/api/workspace";

export interface RailSessionItem {
  id: string;
  label: string;
  cwd: string;
  /** Relative timestamp, e.g. `now`, `12m`, `3h`, `2d`. */
  time: string;
  running: boolean;
}

export interface RailProjectGroup {
  key: string;
  path: string;
  label: string;
  /** Conversations still considered active, newest first. */
  sessions: RailSessionItem[];
  /**
   * Conversations quiet for longer than the threshold, folded into the group's
   * collapsed `Older` sub-group. Empty when the setting is off.
   */
  older: RailSessionItem[];
}

export interface RailViewInput {
  sessions: readonly SessionSummary[];
  projects: readonly ProjectSummary[];
  running: ReadonlySet<string>;
  query?: string;
  runningOnly?: boolean;
  /** Lists sessions marked archived instead of hiding them; off by default. */
  showArchived?: boolean;
  /**
   * Days of silence after which a conversation moves to its group's `Older`
   * sub-group; `0`/absent keeps everything listed.
   */
  inactiveAfterDays?: number;
  /** The conversation open in the chat column, which never counts as old. */
  selectedId?: string | null;
  /** Injected clock for stable labels and tests. */
  now?: number;
}

export interface RailView {
  /** Project sections in pin/sort/label order; sessions newest first. */
  groups: RailProjectGroup[];
}

interface GroupDraft {
  key: string;
  path: string;
  label: string;
  pinOrder: number;
  sortOrder: number;
  sessions: SessionSummary[];
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Session title exactly as stored, trimmed, emoji included; an empty name
 * falls back to the id prefix.
 */
export function sessionLabel(session: SessionSummary): string {
  return session.name?.trim() || session.id.slice(0, 8);
}

/** Last activity in epoch milliseconds; unparseable dates sort last. */
export function sessionTimestamp(session: SessionSummary): number {
  const time = Date.parse(session.lastMessageAt ?? session.modified);
  return Number.isFinite(time) ? time : 0;
}

/** Short relative label; floors, so `59s` is `now` and `61s` is `1m`. */
export function relativeTimeLabel(
  value: string | number | Date | null | undefined,
  now = Date.now(),
): string {
  if (value === null || value === undefined || value === "") return "";
  const time = value instanceof Date
    ? value.getTime()
    : typeof value === "number"
      ? value
      : Date.parse(value);
  if (!Number.isFinite(time)) return "";

  const elapsed = now - time;
  if (elapsed < MINUTE) return "now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;

  const days = Math.floor(elapsed / DAY);
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

/** Lowercased, trimmed needle shared by `matchesSession` and group matching. */
export function normalizeQuery(query: string | undefined): string {
  return (query ?? "").trim().toLowerCase();
}

/** Matches a session title or its working directory against a normalized needle. */
export function matchesSession(session: SessionSummary, needle: string): boolean {
  if (!needle) return true;
  return (
    sessionLabel(session).toLowerCase().includes(needle) ||
    session.cwd.toLowerCase().includes(needle)
  );
}

/** Newest first, with the id as a deterministic tie-break. */
export function compareSessions(left: SessionSummary, right: SessionSummary): number {
  const delta = sessionTimestamp(right) - sessionTimestamp(left);
  return delta !== 0 ? delta : left.id.localeCompare(right.id);
}

/**
 * Whether a conversation has gone quiet long enough to leave the main list.
 * Work in progress always wins over age: a running session and the session open
 * in the chat column stay visible, and an undatable one is never hidden. A
 * search is an explicit request to see everything, so it disables the split.
 */
function isStale(
  session: SessionSummary,
  input: RailViewInput,
  needle: string,
  now: number,
): boolean {
  const days = input.inactiveAfterDays ?? 0;
  if (days <= 0 || needle) return false;
  if (input.running.has(session.id)) return false;
  if (session.id === input.selectedId) return false;
  const timestamp = sessionTimestamp(session);
  return timestamp > 0 && timestamp <= now - days * DAY;
}

function compareGroups(left: GroupDraft, right: GroupDraft): number {
  if (left.pinOrder !== right.pinOrder) return left.pinOrder - right.pinOrder;
  if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
  const byLabel = left.label.localeCompare(right.label);
  return byLabel !== 0 ? byLabel : left.key.localeCompare(right.key);
}

function toItem(
  session: SessionSummary,
  now: number,
  running: ReadonlySet<string>,
): RailSessionItem {
  return {
    id: session.id,
    label: sessionLabel(session),
    cwd: session.cwd,
    time: relativeTimeLabel(session.lastMessageAt ?? session.modified, now),
    running: running.has(session.id),
  };
}

/**
 * Builds everything a rail renders. Every session lives in its project group,
 * running or not; a group also matches the query by its own label or path.
 */
export function buildRailView(input: RailViewInput): RailView {
  const now = input.now ?? Date.now();
  const needle = normalizeQuery(input.query);
  const runningOnly = input.runningOnly === true;
  const drafts = new Map<string, GroupDraft>();

  for (const project of input.projects) {
    const key = comparablePath(project.path);
    drafts.set(key, {
      key,
      path: project.path,
      label: project.alias?.trim() || basename(project.path),
      pinOrder: project.pinOrder ?? Number.POSITIVE_INFINITY,
      sortOrder: project.sortOrder ?? Number.POSITIVE_INFINITY,
      sessions: [],
    });
  }

  for (const session of input.sessions) {
    if (session.archived === true && input.showArchived !== true) continue;
    const root = session.projectRoot ?? session.cwd;
    const key = comparablePath(root);
    let group = drafts.get(key);
    if (!group) {
      group = {
        key,
        path: root,
        label: basename(root),
        pinOrder: Number.POSITIVE_INFINITY,
        sortOrder: Number.POSITIVE_INFINITY,
        sessions: [],
      };
      drafts.set(key, group);
    }
    group.sessions.push(session);
  }

  const ordered = [...drafts.values()].sort(compareGroups);
  for (const group of ordered) group.sessions.sort(compareSessions);

  const groups: RailProjectGroup[] = [];
  for (const group of ordered) {
    const visible = group.sessions
      .filter((session) => matchesSession(session, needle))
      .filter((session) => !runningOnly || input.running.has(session.id));
    const older = visible.filter((session) => isStale(session, input, needle, now));
    const fresh = visible.filter((session) => !older.includes(session));

    if (runningOnly && fresh.length === 0) continue;
    if (needle && fresh.length === 0 && older.length === 0) {
      const haystack = `${group.label}\n${group.path}`.toLowerCase();
      if (!haystack.includes(needle)) continue;
    }

    groups.push({
      key: group.key,
      path: group.path,
      label: group.label,
      sessions: fresh.map((session) => toItem(session, now, input.running)),
      older: older.map((session) => toItem(session, now, input.running)),
    });
  }

  return { groups };
}
