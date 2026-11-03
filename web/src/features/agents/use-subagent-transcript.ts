import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSubagentPage, parseSubagentMessages } from "@/api/subagents";
import type { ChatMessage } from "@/api/session-types";
import { getTranscriptVersion } from "@/state/subagents-store";
import { useSubagent, useTranscriptVersion } from "@/state/use-subagents";

/**
 * Window of one subagent's transcript.
 *
 * Opens on the tail (an agent can be far past page one), follows forward when
 * the roster bumps its transcript version, and pages backwards on demand. Every
 * request is bounded by the server's page size; nothing polls.
 */

export interface SubagentTranscriptState {
  messages: readonly ChatMessage[];
  fromByte: number;
  nextByte: number;
  totalBytes: number | null;
  /** Whether earlier content exists above the loaded window. */
  hasOlder: boolean;
  loading: boolean;
  loadingOlder: boolean;
  error: string | null;
}

const INITIAL: SubagentTranscriptState = {
  messages: [],
  fromByte: 0,
  nextByte: 0,
  totalBytes: null,
  hasOlder: false,
  loading: true,
  loadingOlder: false,
  error: null,
};

/** Frames arrive in bursts; one fetch per burst is enough. */
const FOLLOW_DEBOUNCE_MS = 250;

export interface SubagentTranscript extends SubagentTranscriptState {
  loadOlder: () => void;
}

export function useSubagentTranscript(sessionId: string, subagentId: string): SubagentTranscript {
  const [state, setState] = useState<SubagentTranscriptState>(INITIAL);
  const fromByteRef = useRef(0);
  const nextByteRef = useRef(0);
  const loadedVersionRef = useRef(0);
  const readyRef = useRef(false);
  const busyRef = useRef(false);
  const loadingOlderRef = useRef(false);
  const version = useTranscriptVersion(sessionId, subagentId);
  const row = useSubagent(sessionId, subagentId);

  // Open on the tail. Also the recovery path when the file reset underneath us.
  useEffect(() => {
    let cancelled = false;
    readyRef.current = false;
    busyRef.current = false;
    fromByteRef.current = 0;
    nextByteRef.current = 0;
    setState(INITIAL);
    void (async () => {
      try {
        const page = await fetchSubagentPage(sessionId, subagentId, { mode: "tail" });
        if (cancelled) return;
        const fromByte = page.fromByte ?? 0;
        const nextByte = page.nextByte ?? fromByte;
        fromByteRef.current = fromByte;
        nextByteRef.current = nextByte;
        loadedVersionRef.current = getTranscriptVersion(sessionId, subagentId);
        readyRef.current = true;
        setState({
          messages: parseSubagentMessages(page.messages),
          fromByte,
          nextByte,
          totalBytes: page.totalBytes ?? null,
          hasOlder: fromByte > 0,
          loading: false,
          loadingOlder: false,
          error: page.error ?? null,
        });
      } catch (error) {
        if (cancelled) return;
        setState({
          ...INITIAL,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, subagentId]);

  const follow = useCallback(async (): Promise<void> => {
    if (!readyRef.current || busyRef.current) return;
    const from = nextByteRef.current;
    // Version is captured BEFORE the request: a bump during the fetch must
    // trigger another pass instead of being marked as loaded.
    const atStart = getTranscriptVersion(sessionId, subagentId);
    busyRef.current = true;
    try {
      const page = await fetchSubagentPage(sessionId, subagentId, { fromByte: from });
      if (page.reset === true) {
        // The file was replaced or truncated: the tail is the only sane window
        // now, so re-open on it instead of appending to a dead offset.
        const tail = await fetchSubagentPage(sessionId, subagentId, { mode: "tail" });
        const fromByte = tail.fromByte ?? 0;
        fromByteRef.current = fromByte;
        nextByteRef.current = tail.nextByte ?? fromByte;
        loadedVersionRef.current = atStart;
        setState({
          messages: parseSubagentMessages(tail.messages),
          fromByte,
          nextByte: nextByteRef.current,
          totalBytes: tail.totalBytes ?? null,
          hasOlder: fromByte > 0,
          loading: false,
          loadingOlder: false,
          error: tail.error ?? null,
        });
        return;
      }
      const fresh = parseSubagentMessages(page.messages);
      nextByteRef.current = page.nextByte ?? from;
      loadedVersionRef.current = atStart;
      if (fresh.length === 0) {
        setState((previous) => ({
          ...previous,
          nextByte: nextByteRef.current,
          totalBytes: page.totalBytes ?? previous.totalBytes,
        }));
        return;
      }
      setState((previous) => ({
        ...previous,
        messages: [...previous.messages, ...fresh],
        nextByte: nextByteRef.current,
        totalBytes: page.totalBytes ?? previous.totalBytes,
      }));
    } catch {
      // A failed follow is retried on the next version bump; the page already
      // on screen stays valid.
    } finally {
      busyRef.current = false;
    }
  }, [sessionId, subagentId]);

  // Follow on transcript bumps, and once more when the agent settles (its last
  // message can land after the final bump).
  useEffect(() => {
    if (!readyRef.current) return;
    const settled = row?.status !== undefined && row.status !== "started";
    if (!settled && version <= loadedVersionRef.current) return;
    const timer = setTimeout(() => void follow(), FOLLOW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [version, follow, row?.status]);

  const loadOlder = useCallback((): void => {
    if (!readyRef.current || busyRef.current || loadingOlderRef.current) return;
    const before = fromByteRef.current;
    if (before <= 0) return;
    loadingOlderRef.current = true;
    setState((previous) => ({ ...previous, loadingOlder: true }));
    void (async () => {
      try {
        const page = await fetchSubagentPage(sessionId, subagentId, { mode: "before", beforeByte: before });
        const older = parseSubagentMessages(page.messages);
        fromByteRef.current = page.fromByte ?? 0;
        setState((previous) => ({
          ...previous,
          messages: [...older, ...previous.messages],
          fromByte: fromByteRef.current,
          hasOlder: fromByteRef.current > 0,
          loadingOlder: false,
        }));
      } catch (error) {
        setState((previous) => ({
          ...previous,
          loadingOlder: false,
          error: error instanceof Error ? error.message : String(error),
        }));
      } finally {
        loadingOlderRef.current = false;
      }
    })();
  }, [sessionId, subagentId]);

  return { ...state, loadOlder };
}
