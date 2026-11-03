import { useCallback, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSubagentRoster, type SubagentRow } from "@/api/subagents";
import {
  getActiveSubagents,
  getAgentRoster,
  getSubagent,
  getTranscriptVersion,
  subscribeAgentRoster,
  type AgentRoster,
} from "./subagents-store";

const EMPTY_ROWS: readonly SubagentRow[] = Object.freeze([]);

/** Latest roster snapshot of one session, or null before the first frame. */
export function useAgentRoster(sessionId: string | null): AgentRoster | null {
  const subscribe = useCallback(
    (listener: () => void) => (sessionId ? subscribeAgentRoster(sessionId, listener) : () => {}),
    [sessionId],
  );
  const getSnapshot = useCallback(
    () => (sessionId ? getAgentRoster(sessionId) : null),
    [sessionId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

/**
 * Subagents running right now. The selector is memoized on the roster identity,
 * so a strip that repaints every second never re-renders the roster list.
 */
export function useActiveSubagents(sessionId: string | null): readonly SubagentRow[] {
  const subscribe = useCallback(
    (listener: () => void) => (sessionId ? subscribeAgentRoster(sessionId, listener) : () => {}),
    [sessionId],
  );
  const getSnapshot = useCallback(
    () => (sessionId ? getActiveSubagents(sessionId) : EMPTY_ROWS),
    [sessionId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_ROWS);
}

/** One roster row, re-rendering only when that row changes. */
export function useSubagent(sessionId: string | null, subagentId: string | null): SubagentRow | null {
  const subscribe = useCallback(
    (listener: () => void) => (sessionId ? subscribeAgentRoster(sessionId, listener) : () => {}),
    [sessionId],
  );
  const getSnapshot = useCallback(
    () => (sessionId && subagentId ? getSubagent(sessionId, subagentId) : null),
    [sessionId, subagentId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

/**
 * Rows for the roster list: the live snapshot when it exists, HTTP otherwise.
 *
 * The HTTP fallback is enabled only after the channel reported a failure — the
 * channel serves an on-disk roster even without a live wrapper, so a healthy
 * stream always has data and a second source would only race it.
 */
export function useAgentRows(sessionId: string | null): {
  rows: readonly SubagentRow[];
  live: boolean;
  loading: boolean;
} {
  const roster = useAgentRoster(sessionId);
  const fallback = useQuery({
    queryKey: ["subagents", sessionId],
    queryFn: () => fetchSubagentRoster(sessionId as string),
    enabled: sessionId !== null && roster?.error != null,
    staleTime: 5_000,
  });
  const rows = roster !== null && roster.roster.length > 0 ? roster.roster : (fallback.data ?? EMPTY_ROWS);
  return {
    rows,
    live: roster?.live ?? false,
    loading: roster === null && sessionId !== null && fallback.isPending,
  };
}

/**
 * Counter that ticks when this subagent's transcript gains content. A reader
 * fetches the next page on a bump instead of polling the file.
 */
export function useTranscriptVersion(sessionId: string | null, subagentId: string | null): number {
  const subscribe = useCallback(
    (listener: () => void) => (sessionId ? subscribeAgentRoster(sessionId, listener) : () => {}),
    [sessionId],
  );
  const getSnapshot = useCallback(
    () => (sessionId && subagentId ? getTranscriptVersion(sessionId, subagentId) : 0),
    [sessionId, subagentId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}
