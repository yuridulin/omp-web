import { useSyncExternalStore } from "react";

export interface EditorDraft {
  content: string;
  baseContent: string;
}

/**
 * In-memory drafts keyed by workbench tab id (`fileTabId(path)`).
 * Drafts survive tab switches but are intentionally never persisted.
 */
const drafts = new Map<string, EditorDraft>();
const listeners = new Set<() => void>();

let dirtySnapshot: ReadonlySet<string> = new Set();

function emit(): void {
  const next = new Set(drafts.keys());
  let changed = next.size !== dirtySnapshot.size;
  if (!changed) {
    for (const key of next) {
      if (!dirtySnapshot.has(key)) {
        changed = true;
        break;
      }
    }
  }
  if (changed) dirtySnapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getDirtySnapshot(): ReadonlySet<string> {
  return dirtySnapshot;
}

export function getEditorDraft(tabId: string): EditorDraft | null {
  return drafts.get(tabId) ?? null;
}

export function setEditorDraft(tabId: string, draft: EditorDraft): void {
  const previous = drafts.get(tabId);
  if (previous && previous.content === draft.content && previous.baseContent === draft.baseContent) return;
  drafts.set(tabId, draft);
  emit();
}

export function clearEditorDraft(tabId: string): void {
  if (!drafts.delete(tabId)) return;
  emit();
}

export function isTabDirty(tabId: string): boolean {
  return drafts.has(tabId);
}

export function useDirtyTabIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getDirtySnapshot, getDirtySnapshot);
}

/** Move a pending draft when its tab is renamed or moved. */
export function renameEditorTab(from: string, to: string): void {
  const draft = drafts.get(from);
  if (!draft) return;
  if (from === to) return;
  drafts.delete(from);
  drafts.set(to, draft);
  emit();
}

export function forgetEditorTab(tabId: string): void {
  clearEditorDraft(tabId);
}

export function resetEditorState(): void {
  if (drafts.size === 0) return;
  drafts.clear();
  emit();
}
