import { watch, type FSWatcher } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { isWindowsAbsolutePath } from "./paths";

/**
 * Project file watcher for the workspace SSE channel.
 *
 * One recursive `fs.watch` per root, shared by every subscribed tab and
 * debounced so a formatter or `git checkout` cannot flood the socket. `.git`
 * and `node_modules` are noise for a file tree and are skipped.
 */

const DEBOUNCE_MS = 150;
const MAX_PATHS_PER_EVENT = 2000;
const IGNORED_SEGMENTS: Record<string, true> = { node_modules: true, ".git": true };

export interface WorkspaceChange {
  root: string;
  paths: string[];
  truncated: boolean;
}

type Listener = (change: WorkspaceChange) => void;

interface WatchEntry {
  watcher: FSWatcher;
  listeners: Set<Listener>;
  pending: Set<string>;
  truncated: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

const entries = new Map<string, WatchEntry>();

function watchKey(root: string): string {
  const key = resolve(root);
  return isWindowsAbsolutePath(key) ? key.toLowerCase() : key;
}

export function isIgnoredWorkspacePath(relativePath: string): boolean {
  return relativePath.split(/[\\/]/).some((segment) => IGNORED_SEGMENTS[segment] === true);
}

function flush(key: string, entry: WatchEntry): void {
  entry.timer = null;
  if (entry.pending.size === 0 && !entry.truncated) return;
  const change: WorkspaceChange = {
    root: key,
    paths: [...entry.pending].sort(),
    truncated: entry.truncated,
  };
  entry.pending.clear();
  entry.truncated = false;
  for (const listener of entry.listeners) {
    try {
      listener(change);
    } catch {
      // One broken subscriber must not stop the others.
    }
  }
}

function closeEntry(key: string, entry: WatchEntry): void {
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = null;
  try {
    entry.watcher.close();
  } catch {
    // Already closed.
  }
  entries.delete(key);
}

/** Subscribe to one workspace root; returns the unsubscribe function. */
export function watchWorkspace(root: string, listener: Listener): () => void {
  const key = watchKey(root);
  let entry = entries.get(key);
  if (!entry) {
    const watcher = watch(key, { recursive: true }, (_eventType, filename) => {
      const current = entries.get(key);
      if (!current) return;
      if (!filename) {
        current.truncated = true;
      } else {
        const rel = relative(key, resolve(key, filename)).split(sep).join("/");
        if (rel && !isIgnoredWorkspacePath(rel)) {
          if (current.pending.size < MAX_PATHS_PER_EVENT) current.pending.add(rel);
          else current.truncated = true;
        }
      }
      if (!current.timer) {
        current.timer = setTimeout(() => flush(key, current), DEBOUNCE_MS);
        current.timer.unref?.();
      }
    });
    watcher.on("error", () => {
      const current = entries.get(key);
      if (current) closeEntry(key, current);
    });
    entry = { watcher, listeners: new Set(), pending: new Set(), truncated: false, timer: null };
    entries.set(key, entry);
  }
  entry.listeners.add(listener);
  const watched = entry;
  return () => {
    watched.listeners.delete(listener);
    if (watched.listeners.size === 0) closeEntry(key, watched);
  };
}
