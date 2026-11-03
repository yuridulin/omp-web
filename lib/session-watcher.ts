import { readdirSync, watch, type FSWatcher } from "fs";
import { join } from "path";
import { readSessionHeaderSync } from "./omp/session-files";
import {
  getAgentDir,
  invalidateSessionEntriesCache,
  invalidateSessionListCache,
  invalidateSessionListMeta,
  listAllSessions,
  resolveSessionIdByPath,
} from "./session-reader";

// omp owns the writes to a session's JSONL. ompweb streams RPC events only for
// the sessions it spawned itself, so a session started outside the web UI — by
// `omp` in a terminal, or by a harness that launches omp — never updated while
// it was open: the file grew and nothing told the browser. This watches the
// session tree and reports which session ids changed, which the running-events
// stream forwards to the client.
//
// The tree is two levels deep (`sessions/<project>/<id>.jsonl`), so it is
// watched one directory at a time: `recursive: true` is not portable — Bun
// refuses it where the platform has no recursive primitive (Linux), and the
// watcher then never starts at all. Per-directory watchers also stay cheap:
// one per project directory, re-armed when the root reports a new or gone one.

type Listener = (sessionIds: string[]) => void;

const DEBOUNCE_MS = 250;
/** A directory event lands after the writes it caused; re-arm shortly after. */
const RESYNC_MS = 250;

const listeners = new Set<Listener>();
/** One watcher per directory: the sessions root plus each project directory. */
const watchers = new Map<string, FSWatcher>();
/** Sessions root the current watchers were armed against. */
let armedRoot: string | null = null;
let pendingPaths = new Set<string>();
let pendingUnknown = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let resyncTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const RETRY_MS = 5000;

function flush(): void {
  flushTimer = null;
  const paths = [...pendingPaths];
  pendingPaths = new Set();
  const hadUnknown = pendingUnknown;
  pendingUnknown = false;
  if (paths.length === 0 && !hadUnknown) return;

  if (hadUnknown) {
    // filename was null — fs.watch coalesced the event or overflowed. We
    // don't know which file changed, so fall back to the full invalidation.
    invalidateSessionListCache();
    void rescanAndNotify();
    return;
  }

  // Known paths: refresh the list metadata (a changed file means the cached
  // list's mtimes and message counts are stale) and invalidate ONLY the
  // changed sessions' parse caches, leaving unrelated sessions cached.
  invalidateSessionListMeta();
  for (const path of paths) invalidateSessionEntriesCache(path);

  void Promise.all(paths.map((path) => idForChangedPath(path)))
    .then((ids) => {
      const sessionIds = [...new Set(ids.filter((id): id is string => Boolean(id)))];
      // A path that resolved to no id is a change we failed to attribute (a
      // brand-new file the list scan has not picked up, or a scan that raced
      // this write). Dropping it silently loses the update, so fall back to the
      // same broad rescan the unnameable-event path uses.
      if (sessionIds.length < paths.length) {
        void rescanAndNotify();
        return;
      }
      if (sessionIds.length === 0) return;
      for (const listener of listeners) {
        try {
          listener(sessionIds);
        } catch {
          // a failing subscriber must not stop the others
        }
      }
    })
    .catch(() => {
      // resolution failures are not worth tearing the watcher down for
    });
}

/**
 * Session id of one changed file.
 *
 * The list index is tried first (it is authoritative and cached), but a session
 * file written for the first time can be newer than the last scan — the header
 * of the file itself always names the id.
 */
async function idForChangedPath(path: string): Promise<string | undefined> {
  const resolved = await resolveSessionIdByPath(path).catch(() => undefined);
  if (resolved) return resolved;
  return readSessionHeaderSync(path)?.id;
}

async function rescanAndNotify(): Promise<void> {
  try {
    const sessions = await listAllSessions();
    const sessionIds = sessions.map((s) => s.id);
    if (sessionIds.length === 0) return;
    for (const listener of listeners) {
      try {
        listener(sessionIds);
      } catch {
        // a failing subscriber must not stop the others
      }
    }
  } catch {
    // resolution failures are not worth tearing the watcher down for
  }
}

function scheduleRetry(): void {
  if (retryTimer || listeners.size === 0) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    ensureWatcher();
  }, RETRY_MS);
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(flush, DEBOUNCE_MS);
}

/** Coalesces the re-arms a burst of directory events would otherwise cause. */
function scheduleResync(): void {
  if (resyncTimer || listeners.size === 0) return;
  resyncTimer = setTimeout(() => {
    resyncTimer = null;
    syncTree();
  }, RESYNC_MS);
}

function closeWatchers(): void {
  for (const watcher of watchers.values()) {
    try {
      watcher.close();
    } catch {
      // A watcher whose directory vanished may already be closed.
    }
  }
  watchers.clear();
  armedRoot = null;
}

function onEvent(dir: string, filename: string | Buffer | null): void {
  if (!filename) {
    // fs.watch coalesced the event or overflowed: the file is unknown, so the
    // flush falls back to full invalidation, and a directory may have moved.
    pendingUnknown = true;
    scheduleFlush();
    scheduleResync();
    return;
  }
  const name = filename.toString();
  if (name.endsWith(".jsonl")) {
    pendingPaths.add(join(dir, name));
    scheduleFlush();
    return;
  }
  // Anything else in a watched directory is a project directory appearing or
  // vanishing, which only changes the set of directories to watch.
  scheduleResync();
}

function attach(dir: string): void {
  let watcher: FSWatcher;
  try {
    watcher = watch(dir, { persistent: false }, (_event, filename) => onEvent(dir, filename));
  } catch {
    // A directory removed between the scan and the attach, or a refused watch.
    closeWatchers();
    scheduleRetry();
    return;
  }
  watcher.on("error", () => {
    closeWatchers();
    scheduleRetry();
  });
  watchers.set(dir, watcher);
}

/** Attaches a watcher to the sessions root and to every project directory. */
function syncTree(): void {
  const sessionsDir = sessionsRoot();
  let dirs: string[];
  try {
    const entries = readdirSync(sessionsDir, { withFileTypes: true });
    dirs = [sessionsDir];
    for (const entry of entries) {
      if (entry.isDirectory()) dirs.push(join(sessionsDir, entry.name));
    }
  } catch {
    // No sessions directory yet, or it is unreadable: retry while subscribers remain.
    closeWatchers();
    scheduleRetry();
    return;
  }

  for (const [dir, watcher] of watchers) {
    if (dirs.includes(dir)) continue;
    try {
      watcher.close();
    } catch {
      // already closed
    }
    watchers.delete(dir);
  }
  armedRoot = sessionsDir;
  for (const dir of dirs) {
    if (!watchers.has(dir)) attach(dir);
  }
}

/** `<agent dir>/sessions` — the tree the watchers must be armed against. */
function sessionsRoot(): string {
  return join(getAgentDir(), "sessions");
}

function ensureWatcher(): void {
  if (retryTimer) return;
  const root = sessionsRoot();
  if (watchers.size > 0 && armedRoot === root) return;
  // A different agent dir (`PI_CODING_AGENT_DIR`, tests) must not leave the
  // watchers pointing at the previous tree: every later event would be
  // attributed to a root nobody reads.
  closeWatchers();
  syncTree();
}

export function subscribeSessionFileChanges(listener: Listener): () => void {
  listeners.add(listener);
  ensureWatcher();
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (resyncTimer) {
      clearTimeout(resyncTimer);
      resyncTimer = null;
    }
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    pendingPaths = new Set();
    pendingUnknown = false;
    closeWatchers();
  };
}
