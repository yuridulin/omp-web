import { useCallback, useSyncExternalStore } from "react";
import { getComposerDraft, subscribeComposerDraft } from "./composer-store";

/** Read one session draft and re-render when any skin writes it. */
export function useComposerDraft(sessionId: string | null): string {
  const subscribe = useCallback(
    (listener: () => void) => (sessionId ? subscribeComposerDraft(listener) : () => {}),
    [sessionId],
  );
  const getSnapshot = useCallback(
    () => (sessionId ? getComposerDraft(sessionId) : ""),
    [sessionId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => "");
}
