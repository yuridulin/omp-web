/**
 * Composer drafts are shared by every chat skin. The store is the single owner
 * of `omp.composer.v1.<sessionId>` so switching sessions or skins cannot lose
 * text, and a drop handler only needs a session id plus a path.
 */

const DRAFT_PREFIX = "omp.composer.v1.";

/** Draft key for the empty chat that becomes a session on first send. */
export const NEW_SESSION_DRAFT_ID = "__new_session__";

export interface ComposerImage {
  id: string;
  data: string;
  mimeType: string;
  /** Decoded bytes; the paste preflight keeps count and total under the server budget. */
  size: number;
}

export const EMPTY_COMPOSER_IMAGES: readonly ComposerImage[] = [];

const drafts = new Map<string, string>();
const images = new Map<string, readonly ComposerImage[]>();
const seeded = new Set<string>();
const listeners = new Set<() => void>();
let nextImageId = 1;

/** Give pasted image data an identity for rendering and removal. */
export function makeComposerImage(data: string, mimeType: string, size: number): ComposerImage {
  return { id: `image-${nextImageId++}`, data, mimeType, size };
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function draftKey(sessionId: string): string {
  return `${DRAFT_PREFIX}${sessionId}`;
}

function readStored(sessionId: string): string {
  try {
    return storage()?.getItem(draftKey(sessionId)) ?? "";
  } catch {
    return "";
  }
}

function writeStored(sessionId: string, value: string): void {
  try {
    if (value === "") storage()?.removeItem(draftKey(sessionId));
    else storage()?.setItem(draftKey(sessionId), value);
  } catch {
    // Storage may be unavailable (private mode, quota); drafts stay in memory.
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function getComposerDraft(sessionId: string): string {
  let value = drafts.get(sessionId);
  if (value === undefined) {
    value = readStored(sessionId);
    drafts.set(sessionId, value);
  }
  return value;
}

/** Attachments are memory-only: base64 image data would exhaust localStorage. */
export function getComposerImages(sessionId: string): readonly ComposerImage[] {
  return images.get(sessionId) ?? EMPTY_COMPOSER_IMAGES;
}

export function addComposerImages(sessionId: string, added: readonly ComposerImage[]): void {
  if (added.length === 0) return;
  images.set(sessionId, [...getComposerImages(sessionId), ...added]);
  emit();
}

export function removeComposerImage(sessionId: string, id: string): void {
  const current = getComposerImages(sessionId);
  const next = current.filter((image) => image.id !== id);
  if (next.length === current.length) return;
  if (next.length === 0) images.delete(sessionId);
  else images.set(sessionId, next);
  emit();
}

/** Write a draft as the user types. Empty text removes the persisted key. */
export function setComposerDraft(sessionId: string, value: string): void {
  seeded.add(sessionId);
  if (getComposerDraft(sessionId) === value) return;
  drafts.set(sessionId, value);
  writeStored(sessionId, value);
  emit();
}

/**
 * Seed from the server snapshot once per session. The value stays in memory
 * until the user types, so a server draft never rewrites local storage on its
 * own. Existing local text always wins.
 */
export function seedComposerDraft(sessionId: string, value: string): void {
  if (seeded.has(sessionId)) return;
  seeded.add(sessionId);
  if (readStored(sessionId) !== "") return;
  if (drafts.has(sessionId) && getComposerDraft(sessionId) !== "") return;
  drafts.set(sessionId, value);
  emit();
}

/** Append dropped text; a non-empty current draft separates with one space. */
export function appendComposerDraft(sessionId: string, text: string): void {
  if (text === "") return;
  const current = getComposerDraft(sessionId);
  setComposerDraft(sessionId, current === "" ? text : `${current} ${text}`);
}

/** Clear text and attachments together after a successful send. */
export function clearComposerDraft(sessionId: string): void {
  seeded.add(sessionId);
  let changed = false;
  if (getComposerDraft(sessionId) !== "") {
    drafts.set(sessionId, "");
    writeStored(sessionId, "");
    changed = true;
  }
  if (images.delete(sessionId)) changed = true;
  if (changed) emit();
}

export function subscribeComposerDraft(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam: clear memory and every persisted composer key. */
export function resetComposerStoreForTests(): void {
  drafts.clear();
  images.clear();
  seeded.clear();
  listeners.clear();
  nextImageId = 1;
  const store = storage();
  if (!store) return;
  for (let index = store.length - 1; index >= 0; index -= 1) {
    const key = store.key(index);
    if (key?.startsWith(DRAFT_PREFIX)) store.removeItem(key);
  }
}
