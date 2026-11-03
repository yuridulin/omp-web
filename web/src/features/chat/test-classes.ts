import type {
  ComposerClasses,
  ExtensionDialogClasses,
  RunningAgentsClasses,
  ModelPickerClasses,
  QueueClasses,
  TranscriptClasses,
} from "./classes";

/**
 * Feature tests assert behavior (roles, text, keyboard rules), so the class
 * map only has to be a complete, stable set of names. Each property resolves
 * to its own key.
 */
export function classMap<T>(): T {
  return new Proxy(
    {},
    {
      get: (_target, key) => String(key),
    },
  ) as T;
}

export const testTranscriptClasses = classMap<TranscriptClasses>();
export const testComposerClasses = classMap<ComposerClasses>();
export const testQueueClasses = classMap<QueueClasses>();
export const testModelPickerClasses = classMap<ModelPickerClasses>();
export const testExtensionDialogClasses = classMap<ExtensionDialogClasses>();
export const testRunningAgentsClasses = classMap<RunningAgentsClasses>();
