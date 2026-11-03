import type { SubagentActivityEvent, SubagentRow, SubagentsFrame } from "@/api/subagents";

/**
 * Client cache of a session's subagent roster.
 *
 * The server composes the roster (on-disk history folded with live frames) and
 * sends complete snapshots over the `subagents` channel; this store only keeps
 * the latest snapshot per session and notifies React. Nothing here derives
 * session rules — that stays in `core/subagents.ts` on the server.
 */

export interface AgentRoster {
  revision: number;
  /** False when the roster came from disk only (no live wrapper). */
  live: boolean;
  roster: readonly SubagentRow[];
  activity: Readonly<Record<string, readonly SubagentActivityEvent[]>>;
  /** Per-subagent transcript counter (see `contract/events.md`). */
  transcriptVersions: Readonly<Record<string, number>>;
  /** Set when the channel could not be opened; readers fall back to HTTP. */
  error: string | null;
}

const EMPTY_ROSTER: AgentRoster = {
  revision: 0,
  live: false,
  roster: [],
  activity: {},
  transcriptVersions: {},
  error: null,
};

const EMPTY_ROWS: readonly SubagentRow[] = Object.freeze([]);

const rosters = new Map<string, AgentRoster>();
const listeners = new Map<string, Set<() => void>>();
// Derived active list per session, keyed on the frame's roster identity so a
// strip subscribing to "who is running" does not re-render the list panel.
const activeCache = new Map<string, { source: readonly SubagentRow[]; active: readonly SubagentRow[] }>();

function emit(sessionId: string): void {
  for (const listener of listeners.get(sessionId) ?? []) listener();
}

/**
 * Apply one complete roster snapshot.
 *
 * Frames of one subscription arrive in order and a reconnect replays a full
 * snapshot, so the newest frame simply replaces the cache — a revision fence
 * would reject the replay after a server restart, when revisions begin again.
 */
export function applySubagentsFrame(sessionId: string, frame: SubagentsFrame): void {
  rosters.set(sessionId, {
    revision: frame.revision,
    live: frame.live,
    roster: frame.roster,
    activity: frame.activity,
    transcriptVersions: frame.transcriptVersions,
    error: null,
  });
  emit(sessionId);
}

/** Record a refused/failed channel; the roster itself is left untouched. */
export function setSubagentsStreamError(sessionId: string, message: string): void {
  const previous = rosters.get(sessionId) ?? EMPTY_ROSTER;
  if (previous.error === message) return;
  rosters.set(sessionId, { ...previous, error: message });
  emit(sessionId);
}

export function getAgentRoster(sessionId: string): AgentRoster | null {
  return rosters.get(sessionId) ?? null;
}

export function subscribeAgentRoster(sessionId: string, listener: () => void): () => void {
  let set = listeners.get(sessionId);
  if (!set) {
    set = new Set();
    listeners.set(sessionId, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(sessionId);
  };
}

/** Subagents that are running right now, in roster order. Stable per snapshot. */
export function getActiveSubagents(sessionId: string): readonly SubagentRow[] {
  const roster = rosters.get(sessionId);
  if (!roster) return EMPTY_ROWS;
  const cached = activeCache.get(sessionId);
  if (cached && cached.source === roster.roster) return cached.active;
  const active = roster.roster.filter((row) => row.status === "started");
  activeCache.set(sessionId, { source: roster.roster, active });
  return active;
}

/** Transcript counter of one subagent; 0 when nothing was recorded yet. */
export function getTranscriptVersion(sessionId: string, subagentId: string): number {
  return rosters.get(sessionId)?.transcriptVersions[subagentId] ?? 0;
}

export function getSubagent(sessionId: string, subagentId: string): SubagentRow | null {
  const roster = rosters.get(sessionId);
  if (!roster) return null;
  return roster.roster.find((row) => row.id === subagentId) ?? null;
}

/** Test seam: drop cached rosters without touching the server. */
export function resetSubagentRosters(): void {
  rosters.clear();
  listeners.clear();
  activeCache.clear();
}
