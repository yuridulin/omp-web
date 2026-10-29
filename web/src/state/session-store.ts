import type { SessionSnapshot, SnapshotFrame } from "@/api/session-types";

/**
 * Client cache of authoritative session snapshots. The server is the source of
 * truth; this store only merges frames and notifies React.
 */

const snapshots = new Map<string, SessionSnapshot>();
const listeners = new Map<string, Set<() => void>>();

export function isSnapshotFrame(frame: { type: string; [key: string]: unknown }): frame is SnapshotFrame {
  return frame.type === "snapshot" && typeof frame.snapshot === "object" && frame.snapshot !== null;
}

function emit(sessionId: string): void {
  for (const listener of listeners.get(sessionId) ?? []) listener();
}

function merge(previous: SessionSnapshot, next: SessionSnapshot): SessionSnapshot {
  return {
    ...previous,
    ...next,
    session: { ...previous.session, ...next.session },
  };
}

export function applySnapshotFrame(sessionId: string, frame: SnapshotFrame): void {
  const previous = snapshots.get(sessionId);
  snapshots.set(sessionId, frame.history || !previous ? frame.snapshot : merge(previous, frame.snapshot));
  emit(sessionId);
}

export function getSessionSnapshot(sessionId: string): SessionSnapshot | null {
  return snapshots.get(sessionId) ?? null;
}

export function subscribeSession(sessionId: string, listener: () => void): () => void {
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

/** Test seam: drop cached snapshots without touching the server. */
export function resetSessionSnapshots(): void {
  snapshots.clear();
  listeners.clear();
}
