import { useCallback, useSyncExternalStore } from "react";
import {
  EMPTY_COMPOSER_IMAGES,
  getComposerDraft,
  getComposerImages,
  subscribeComposerDraft,
  type ComposerImage,
} from "./composer-store";

export interface ComposerDraftValue {
  value: string;
  images: readonly ComposerImage[];
}

/** Read one session draft and re-render when any skin writes it. */
export function useComposerDraft(sessionId: string | null): ComposerDraftValue {
  const subscribe = useCallback(
    (listener: () => void) => (sessionId ? subscribeComposerDraft(listener) : () => {}),
    [sessionId],
  );
  const getText = useCallback(
    () => (sessionId ? getComposerDraft(sessionId) : ""),
    [sessionId],
  );
  const getImages = useCallback(
    () => (sessionId ? getComposerImages(sessionId) : EMPTY_COMPOSER_IMAGES),
    [sessionId],
  );
  const value = useSyncExternalStore(subscribe, getText, () => "");
  const images = useSyncExternalStore(subscribe, getImages, () => EMPTY_COMPOSER_IMAGES);
  return { value, images };
}
