import { readFileSync, statSync, watch, type FSWatcher } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { isWindowsAbsolutePath } from "./paths";

/**
 * Project file watcher for the workspace SSE channel.
 *
 * One recursive `fs.watch` per root, shared by every subscribed tab and
 * debounced so a formatter or `git checkout` cannot flood the socket. `.git`
 * and `node_modules` are noise for a file tree and are skipped by the root
 * walk, so the repository metadata is watched separately: a commit, stage or
 * branch switch made outside the UI (an agent, a terminal) touches no working
 * file, and without that watcher the Changes panel stays stale until its next
 * poll.
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
  /** `.git` (or a worktree's git dir); metadata-only changes are reported as `.git/<name>`. */
  gitWatcher: FSWatcher | null;
  listeners: Set<Listener>;
  pending: Set<string>;
  truncated: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
}

const entries = new Map<string, WatchEntry>();

function watchKey(root: string): string {
  const key = resolve(root);
  return isWindowsAbsolutePath(key) ? key.toLowerCase() : key;
}

export function isIgnoredWorkspacePath(relativePath: string): boolean {
  return relativePath.split(/[\\/]/).some((segment) => IGNORED_SEGMENTS[segment] === true);
}

/** The repository's git dir for `root`, looking up through parent directories. */
function findGitDir(root: string): string | null {
  let dir = root;
  for (;;) {
    const candidate = resolve(dir, ".git");
    try {
      if (statSync(candidate).isDirectory()) return candidate;
      // A worktree or submodule points at its real git dir from a `.git` file.
      const pointer = /^gitdir:\s*(.+)$/im.exec(readFileSync(candidate, "utf8"));
      if (pointer) {
        const target = resolve(dir, pointer[1].trim());
        if (statSync(target).isDirectory()) return target;
      }
    } catch {
      // No `.git` here.
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function noteChange(key: string, entry: WatchEntry, relativePath: string): void {
  if (relativePath !== "") {
    if (entry.pending.size < MAX_PATHS_PER_EVENT) entry.pending.add(relativePath);
    else entry.truncated = true;
  }
  if (!entry.timer) {
    entry.timer = setTimeout(() => flush(key, entry), DEBOUNCE_MS);
    entry.timer.unref?.();
  }
}

function flush(key: string, entry: WatchEntry): void {
  entry.timer = undefined;
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
  clearTimeout(entry.timer);
  entry.timer = undefined;
  try {
    entry.watcher.close();
  } catch {
    // Already closed.
  }
  try {
    entry.gitWatcher?.close();
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
        noteChange(key, current, "");
        return;
      }
      const rel = relative(key, resolve(key, filename)).split(sep).join("/");
      if (rel && !isIgnoredWorkspacePath(rel)) noteChange(key, current, rel);
    });
    watcher.on("error", () => {
      const current = entries.get(key);
      if (current) closeEntry(key, current);
    });

    const gitDir = findGitDir(key);
    let gitWatcher: FSWatcher | null = null;
    if (gitDir) {
      try {
        gitWatcher = watch(gitDir, { persistent: false }, (_eventType, filename) => {
          const current = entries.get(key);
          if (!current) return;
          if (!filename) {
            current.truncated = true;
            noteChange(key, current, "");
            return;
          }
          // Every git invocation (including the status poll) takes index.lock;
          // reporting it would make the poll invalidate itself in a loop.
          if (filename.endsWith(".lock")) return;
          noteChange(key, current, `.git/${filename.split(/[\\/]/).join("/")}`);
        });
        gitWatcher.on("error", () => {
          const current = entries.get(key);
          if (!current) return;
          current.gitWatcher = null;
          try {
            gitWatcher?.close();
          } catch {
            // Already closed.
          }
        });
      } catch {
        // Metadata is a bonus; the root watcher still works.
      }
    }

    entry = { watcher, gitWatcher, listeners: new Set(), pending: new Set(), truncated: false, timer: undefined };
    entries.set(key, entry);
  }
  entry.listeners.add(listener);
  const watched = entry;
  return () => {
    watched.listeners.delete(listener);
    if (watched.listeners.size === 0) closeEntry(key, watched);
  };
}
