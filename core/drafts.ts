import { isRecord } from "./guards";

/**
 * Drafts are domain data: what the user has typed into this conversation but
 * not yet sent. They survive navigation and reloads, which is why they cannot
 * live inside a widget.
 */

export interface DraftImage {
  data: string;
  mimeType: string;
}

export interface DraftFile {
  name: string;
  mimeType: string;
  content: string;
  size: number;
}

export interface Draft {
  value: string;
  images: readonly DraftImage[];
  files: readonly DraftFile[];
}

/**
 * Text to put back into a composer. `replace` merges a later recovery with an
 * earlier one in order: while the draft still starts with `lead`, it becomes
 * `text`; otherwise only `fallback` is prepended.
 */
export interface DraftRecovery {
  text: string;
  replace?: { lead: string; fallback: string };
  images?: readonly DraftImage[];
}

export const EMPTY_DRAFT: Draft = { value: "", images: [], files: [] };

export const MAX_DRAFTS = 50;

export function mergeRecoveredText(current: string, recovery: DraftRecovery): string {
  if (!recovery.text) return current;
  if (recovery.replace && current.startsWith(recovery.replace.lead)) {
    return recovery.text + current.slice(recovery.replace.lead.length);
  }
  const lead = recovery.replace ? recovery.replace.fallback : recovery.text;
  return current ? `${lead}\n\n${current}` : lead;
}

/** Fold a recovery (restored text and attachments) into a draft. */
export function applyRecovery(draft: Draft, recovery: DraftRecovery): Draft {
  return {
    value: mergeRecoveredText(draft.value, recovery),
    images: recovery.images && recovery.images.length ? [...draft.images, ...recovery.images] : draft.images,
    files: draft.files,
  };
}

export function isDraftEmpty(draft: Draft): boolean {
  return draft.value.trim().length === 0 && draft.images.length === 0 && draft.files.length === 0;
}

/**
 * Read a persisted draft. Storage is user-editable and outlives releases, so a
 * malformed entry becomes "no draft" instead of a thrown parse.
 */
export function parseDraft(raw: unknown): Draft | null {
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return null;
    // Current stores hold JSON; earlier releases stored the bare text.
    if (text.startsWith("{")) {
      try {
        return parseDraft(JSON.parse(text));
      } catch {
        return null;
      }
    }
    return { ...EMPTY_DRAFT, value: raw };
  }
  if (!isRecord(raw)) return null;
  const value = typeof raw.value === "string" ? raw.value : "";
  const images = Array.isArray(raw.images) ? raw.images.flatMap(readImage) : [];
  const files = Array.isArray(raw.files) ? raw.files.flatMap(readFile) : [];
  return value || images.length || files.length ? { value, images, files } : null;
}

export function serializeDraft(draft: Draft): string | null {
  return isDraftEmpty(draft) ? null : JSON.stringify(draft);
}

function readImage(value: unknown): DraftImage[] {
  return isRecord(value) && typeof value.data === "string" && typeof value.mimeType === "string"
    ? [{ data: value.data, mimeType: value.mimeType }]
    : [];
}

function readFile(value: unknown): DraftFile[] {
  return isRecord(value)
    && typeof value.name === "string"
    && typeof value.mimeType === "string"
    && typeof value.content === "string"
    && typeof value.size === "number"
    ? [{ name: value.name, mimeType: value.mimeType, content: value.content, size: value.size }]
    : [];
}

/** Keys to drop when the store is over its cap; oldest first. */
export function draftKeysToEvict(keys: readonly string[], max = MAX_DRAFTS): string[] {
  return keys.length <= max ? [] : keys.slice(0, keys.length - max);
}
