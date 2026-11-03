import type { JSX, ReactNode } from "react";
import type { ComposerSubmitMode } from "@/slots/chat";
import {
  addComposerImages,
  clearComposerDraft,
  removeComposerImage,
  setComposerDraft,
  type ComposerImage,
} from "@/state/composer-store";
import { useComposerDraft } from "@/state/use-composer-draft";
import type { ComposerClasses } from "./classes";
import { Composer } from "./Composer";

export interface ComposerDockProps {
  sessionId: string | null;
  classes: ComposerClasses;
  onSend: (
    text: string,
    mode: ComposerSubmitMode,
    images: readonly ComposerImage[],
  ) => Promise<void>;
  onAbort?: () => void | Promise<void>;
  running: boolean;
  pending?: boolean;
  dropActive?: boolean;
  error?: string | null;
  controls?: ReactNode;
  status?: ReactNode;
}

/**
 * Owns the composer draft subscription so keystrokes do not re-render the
 * transcript that sits above this dock.
 */
export function ComposerDock({
  sessionId,
  classes,
  onSend,
  onAbort,
  running,
  pending = false,
  dropActive = false,
  error = null,
  controls,
  status,
}: ComposerDockProps): JSX.Element {
  const { value: draft, images } = useComposerDraft(sessionId);

  const changeDraft = (value: string) => {
    if (sessionId) setComposerDraft(sessionId, value);
  };

  const addImages = (added: ComposerImage[]) => {
    if (sessionId) addComposerImages(sessionId, added);
  };

  const removeImage = (id: string) => {
    if (sessionId) removeComposerImage(sessionId, id);
  };

  const submit = async (
    text: string,
    mode: ComposerSubmitMode,
    attached: readonly ComposerImage[],
  ): Promise<void> => {
    try {
      await onSend(text, mode, attached);
    } catch {
      return;
    }
    if (sessionId) clearComposerDraft(sessionId);
  };

  return (
    <Composer
      value={draft}
      images={images}
      classes={classes}
      onChange={changeDraft}
      onSubmit={submit}
      onAddImages={addImages}
      onRemoveImage={removeImage}
      running={running}
      pending={pending}
      dropActive={dropActive}
      {...(onAbort ? { onAbort } : {})}
      {...(error !== null ? { error } : {})}
      {...(controls !== undefined ? { controls } : {})}
      {...(status !== undefined ? { status } : {})}
    />
  );
}
