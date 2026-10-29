import { useCallback, useSyncExternalStore } from "react";
import type { SessionSnapshot } from "@/api/session-types";
import { getSessionSnapshot, subscribeSession } from "./session-store";

export function useSessionSnapshot(sessionId: string | null): SessionSnapshot | null {
  const subscribe = useCallback(
    (listener: () => void) => (sessionId ? subscribeSession(sessionId, listener) : () => {}),
    [sessionId],
  );
  const getSnapshot = useCallback(
    () => (sessionId ? getSessionSnapshot(sessionId) : null),
    [sessionId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
