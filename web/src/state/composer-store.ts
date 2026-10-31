/**
 * Composer drafts are shared by every chat skin. The store is the single owner
 * of `omp.composer.v1.<sessionId>` so switching sessions or skins cannot lose
 * text, and a drop handler only needs a session id plus a path.
 */

const DRAFT_PREFIX = "omp.composer.v1.";

const drafts = new Map<string, string>();
const seeded = new Set<string>();
const listeners = new Set<() => void>();

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

export function subscribeComposerDraft(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam: clear memory and every persisted composer key. */
export function resetComposerStoreForTests(): void {
  drafts.clear();
  seeded.clear();
  listeners.clear();
  const store = storage();
  if (!store) return;
  for (let index = store.length - 1; index >= 0; index -= 1) {
    const key = store.key(index);
    if (key?.startsWith(DRAFT_PREFIX)) store.removeItem(key);
  }
}
