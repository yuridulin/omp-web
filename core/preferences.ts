import { isToolPreset, type ToolPreset } from "./tool-presets";

/**
 * Client-side composer preferences.
 *
 * These are UI behaviors, not omp config, and they live in host storage. The
 * core decides what a stored value means; the host supplies a key/value store
 * (or `null` when storage is unavailable), so nothing here touches `window`.
 */

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Read a stored string; a throwing or absent store reads as "nothing stored". */
function readStored(storage: KeyValueStorage | null, key: string): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(storage: KeyValueStorage | null, key: string, value: string): void {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // Preferences remain optional when storage is unavailable.
  }
}

export type SubmitDuringRunBehavior = "steer" | "queue";

export const SUBMIT_DURING_RUN_KEY = "omp-web:submit-during-run";

/** The default, applied when nothing was ever stored under the key. */
export const DEFAULT_SUBMIT_DURING_RUN_BEHAVIOR: SubmitDuringRunBehavior = "queue";

/**
 * How a composer submit during a run is delivered. Defaults to `queue`:
 * queuing stays resilient while a `!!` shell command owns the session, where a
 * live steer/prompt frame would collide with the running bash command instead
 * of joining the next turn.
 *
 * Only an explicitly stored choice overrides that default — the option was
 * never written unless the user picked one, so an absent key simply yields
 * "queue" and no stored value needs rewriting.
 */
export function getSubmitDuringRunBehavior(
  storage: KeyValueStorage | null,
  fallback: SubmitDuringRunBehavior = DEFAULT_SUBMIT_DURING_RUN_BEHAVIOR,
): SubmitDuringRunBehavior {
  const value = readStored(storage, SUBMIT_DURING_RUN_KEY);
  return value === "steer" || value === "queue" ? value : fallback;
}

export function setSubmitDuringRunBehavior(storage: KeyValueStorage | null, behavior: SubmitDuringRunBehavior): void {
  writeStored(storage, SUBMIT_DURING_RUN_KEY, behavior);
}

/** Ghost-text word completion: `auto` enables it only with a physical keyboard. */
export type WordCompletionMode = "auto" | "on" | "off";

export const WORD_COMPLETION_KEY = "omp-web:word-completion";

export function parseWordCompletionMode(value: unknown): WordCompletionMode {
  return value === "auto" || value === "on" || value === "off" ? value : "auto";
}

export function getWordCompletionMode(storage: KeyValueStorage | null): WordCompletionMode {
  return parseWordCompletionMode(readStored(storage, WORD_COMPLETION_KEY));
}

export function setWordCompletionMode(storage: KeyValueStorage | null, mode: WordCompletionMode): void {
  writeStored(storage, WORD_COMPLETION_KEY, mode);
}

/**
 * Whether ghost text is on. Browsers cannot see an on-screen keyboard, so
 * `auto` goes by the primary pointer: a mouse/trackpad (`pointer: fine`) means
 * a physical keyboard is likely; touch devices bring their own keyboard
 * suggestions and have no Tab key.
 */
export function isWordCompletionEnabled(mode: WordCompletionMode, finePointer: boolean): boolean {
  return mode === "auto" ? finePointer : mode === "on";
}

export const TOOL_PRESET_KEY = "omp-web:tool-preset";

export function getPreferredToolPreset(storage: KeyValueStorage | null): ToolPreset {
  const value = readStored(storage, TOOL_PRESET_KEY);
  return isToolPreset(value) ? value : "full";
}

export function setPreferredToolPreset(storage: KeyValueStorage | null, preset: ToolPreset): void {
  writeStored(storage, TOOL_PRESET_KEY, preset);
}
