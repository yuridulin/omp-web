import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { ChatMessage } from "@/api/session-types";
import { isRecord } from "@/api/guards";

/** Messages in the first tail page and in each older or forward page. */
export const HISTORY_PAGE_SIZE = 40;

export interface HistoryCursor {
  firstEntryId: string | null;
  lastEntryId: string | null;
}

export interface HistoryModel {
  provider: string;
  modelId: string;
}

interface HistoryPage {
  mode: "append" | "replace" | "prepend";
  hasOlder: boolean;
  hasMore: boolean;
  cursor: HistoryCursor | null;
  messages: ChatMessage[];
  entryIds: string[];
  model: HistoryModel | null;
  thinkingLevel: string | null;
}

export interface HistoryWindow {
  messages: ChatMessage[];
  entryIds: string[];
  hasOlder: boolean;
  cursor: HistoryCursor | null;
  model: HistoryModel | null;
  thinkingLevel: string | null;
  /** Bumps when an older page settles, including a page that adds nothing. */
  olderEpoch: number;
}

const EMPTY_WINDOW: HistoryWindow = {
  messages: [],
  entryIds: [],
  hasOlder: false,
  cursor: null,
  model: null,
  thinkingLevel: null,
  olderEpoch: 0,
};

const windows = new Map<string, HistoryWindow>();
const listeners = new Map<string, Set<() => void>>();
const generations = new Map<string, number>();
const chains = new Map<string, Promise<void>>();

function emit(sessionId: string): void {
  for (const listener of listeners.get(sessionId) ?? []) listener();
}

function windowOf(sessionId: string): HistoryWindow {
  return windows.get(sessionId) ?? EMPTY_WINDOW;
}

function writeWindow(sessionId: string, next: HistoryWindow): void {
  windows.set(sessionId, next);
  emit(sessionId);
}

function enqueue(sessionId: string, job: () => Promise<void>): Promise<void> {
  const previous = chains.get(sessionId) ?? Promise.resolve();
  const next = previous.then(job, job);
  chains.set(sessionId, next);
  return next;
}

function live(sessionId: string, generation: number): boolean {
  return generations.get(sessionId) === generation;
}

export function resetHistoryWindows(): void {
  windows.clear();
  listeners.clear();
  generations.clear();
  chains.clear();
}

function asMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((message) => {
    const role = typeof message.role === "string" ? message.role : "custom";
    return { ...message, role, content: message.content ?? null };
  });
}

function asEntryIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string" && id.length > 0);
}

function asCursor(value: unknown): HistoryCursor | null {
  if (!isRecord(value)) return null;
  const first = value.firstEntryId;
  const last = value.lastEntryId;
  const valid = (id: unknown): id is string | null => id === null || (typeof id === "string" && id.length > 0);
  if (!valid(first) || !valid(last)) return null;
  return { firstEntryId: first, lastEntryId: last };
}

function asModel(value: unknown): HistoryModel | null {
  if (!isRecord(value)) return null;
  if (typeof value.provider !== "string" || typeof value.modelId !== "string") return null;
  return { provider: value.provider, modelId: value.modelId };
}

function parsePage(value: unknown): HistoryPage | null {
  if (!isRecord(value)) return null;
  const mode = value.mode;
  if (mode !== "append" && mode !== "replace" && mode !== "prepend") return null;
  const context = isRecord(value.context) ? value.context : {};
  return {
    mode,
    hasOlder: value.hasOlder === true,
    hasMore: value.hasMore === true,
    cursor: asCursor(value.cursor),
    messages: asMessages(context.messages),
    entryIds: asEntryIds(context.entryIds),
    model: asModel(context.model),
    thinkingLevel: typeof context.thinkingLevel === "string" ? context.thinkingLevel : null,
  };
}

/** Retry budget for one page read. The server already retries its own file
 * races; a socket error or proxy hiccup must not leave the window stale until
 * the next revision, which at the end of a run may never come. */
const PAGE_RETRY_DELAYS_MS = [120, 400] as const;

class HistoryPageError extends Error {
  constructor(readonly retryable: boolean, message: string) {
    super(message);
    this.name = "HistoryPageError";
  }
}

async function fetchPageOnce(
  sessionId: string,
  query: { tail?: boolean; before?: string; cursor?: HistoryCursor },
): Promise<HistoryPage> {
  const search = new URLSearchParams({
    sync: "1",
    deferThinking: "1",
    deferMedia: "1",
    limit: String(HISTORY_PAGE_SIZE),
  });
  if (query.tail) search.set("tail", "1");
  if (query.before) search.set("before", query.before);
  if (query.cursor) search.set("cursor", JSON.stringify(query.cursor));
  const response = await fetch(`/api/agent/sessions/${encodeURIComponent(sessionId)}/context?${search.toString()}`);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(body) && typeof body.error === "string" ? body.error : `HTTP ${response.status}`;
    // 4xx is a real answer (missing session, page too large); a 5xx may be the
    // server losing a race with the writer and is worth another attempt.
    throw new HistoryPageError(response.status >= 500, message);
  }
  const page = parsePage(body);
  if (!page) throw new HistoryPageError(true, "Unexpected history page");
  return page;
}

function retryDelay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

async function fetchPage(
  sessionId: string,
  query: { tail?: boolean; before?: string; cursor?: HistoryCursor },
): Promise<HistoryPage> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetchPageOnce(sessionId, query);
    } catch (error) {
      const retryable = error instanceof HistoryPageError ? error.retryable : true;
      const delay = retryable ? PAGE_RETRY_DELAYS_MS[attempt] : undefined;
      if (delay === undefined) throw error;
      await retryDelay(delay);
    }
  }
}

function applyReplace(sessionId: string, page: HistoryPage, previous: HistoryWindow): void {
  writeWindow(sessionId, {
    messages: page.messages,
    entryIds: page.entryIds,
    hasOlder: page.hasOlder,
    cursor: page.cursor,
    model: page.model ?? previous.model,
    thinkingLevel: page.thinkingLevel ?? previous.thinkingLevel,
    olderEpoch: previous.olderEpoch,
  });
}

function applyAppend(sessionId: string, page: HistoryPage, previous: HistoryWindow): void {
  if (page.messages.length === 0) {
    writeWindow(sessionId, { ...previous, cursor: page.cursor ?? previous.cursor, hasOlder: previous.hasOlder });
    return;
  }
  writeWindow(sessionId, {
    ...previous,
    messages: [...previous.messages, ...page.messages],
    entryIds: [...previous.entryIds, ...page.entryIds],
    cursor: page.cursor ?? previous.cursor,
  });
}

function applyPrepend(sessionId: string, page: HistoryPage, previous: HistoryWindow): void {
  writeWindow(sessionId, {
    ...previous,
    messages: [...page.messages, ...previous.messages],
    entryIds: [...page.entryIds, ...previous.entryIds],
    hasOlder: page.hasOlder,
    cursor: page.cursor ?? previous.cursor,
    olderEpoch: previous.olderEpoch + 1,
  });
}

async function loadTail(sessionId: string): Promise<void> {
  const generation = generations.get(sessionId) ?? 0;
  try {
    const page = await fetchPage(sessionId, { tail: true });
    if (!live(sessionId, generation)) return;
    applyReplace(sessionId, page, windowOf(sessionId));
    await loadForward(sessionId);
  } catch {
    // The transcript stays empty until the next open or revision sync.
  }
}

async function loadForward(sessionId: string): Promise<void> {
  const generation = generations.get(sessionId) ?? 0;
  // One revision can land far behind the file. Keep appending until the tip,
  // and replace the window when the cursor no longer matches the file prefix.
  for (let pageIndex = 0; pageIndex < 50; pageIndex += 1) {
    const previous = windowOf(sessionId);
    if (!previous.cursor) return;
    try {
      const page = await fetchPage(sessionId, { cursor: previous.cursor });
      if (!live(sessionId, generation)) return;
      if (page.mode === "replace") {
        const tail = await fetchPage(sessionId, { tail: true });
        if (!live(sessionId, generation)) return;
        applyReplace(sessionId, tail, windowOf(sessionId));
        return;
      }
      if (page.mode !== "append" || page.messages.length === 0) return;
      applyAppend(sessionId, page, windowOf(sessionId));
      if (!page.hasMore) return;
    } catch {
      // The loaded window stays as it is; the next revision retries.
      return;
    }
  }
}

async function loadOlder(sessionId: string): Promise<void> {
  const generation = generations.get(sessionId) ?? 0;
  const previous = windowOf(sessionId);
  const anchor = previous.entryIds[0];
  if (!previous.hasOlder || !anchor) {
    writeWindow(sessionId, { ...previous, olderEpoch: previous.olderEpoch + 1 });
    return;
  }
  try {
    const page = await fetchPage(sessionId, { before: anchor });
    if (!live(sessionId, generation)) return;
    if (page.mode === "prepend") applyPrepend(sessionId, page, windowOf(sessionId));
    else {
      const latest = windowOf(sessionId);
      applyReplace(sessionId, page, { ...latest, olderEpoch: latest.olderEpoch + 1 });
    }
  } catch {
    if (!live(sessionId, generation)) return;
    const latest = windowOf(sessionId);
    writeWindow(sessionId, { ...latest, olderEpoch: latest.olderEpoch + 1 });
  }
}

/** Drop any in-flight page and load the tail for this session. */
export function openHistoryWindow(sessionId: string): Promise<void> {
  generations.set(sessionId, (generations.get(sessionId) ?? 0) + 1);
  windows.delete(sessionId);
  emit(sessionId);
  return enqueue(sessionId, () => loadTail(sessionId));
}

/** Append commits after the current cursor. No cursor yet means the tail load will catch up. */
export function syncHistoryWindow(sessionId: string): Promise<void> {
  if (!generations.has(sessionId)) return Promise.resolve();
  return enqueue(sessionId, () => loadForward(sessionId));
}

/** Prepend the page before the oldest loaded entry. */
export function loadOlderHistory(sessionId: string): Promise<void> {
  if (!generations.has(sessionId)) return Promise.resolve();
  return enqueue(sessionId, () => loadOlder(sessionId));
}

export function getHistoryWindow(sessionId: string | null): HistoryWindow {
  if (!sessionId) return EMPTY_WINDOW;
  return windowOf(sessionId);
}

export function subscribeHistoryWindow(sessionId: string | null, listener: () => void): () => void {
  if (!sessionId) return () => {};
  let set = listeners.get(sessionId);
  if (!set) {
    set = new Set();
    listeners.set(sessionId, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(sessionId);
  };
}

/**
 * Tail of the transcript, then older pages on demand and a forward page when
 * the snapshot revision changes. The snapshot itself does not carry messages.
 */
export function useHistoryWindow(
  sessionId: string | null,
  historyRevision: number | null,
  runStatus: "idle" | "running" | null = null,
): HistoryWindow {
  const subscribe = useCallback(
    (listener: () => void) => subscribeHistoryWindow(sessionId, listener),
    [sessionId],
  );
  const getSnapshot = useCallback(() => getHistoryWindow(sessionId), [sessionId]);
  const history = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_WINDOW);

  useEffect(() => {
    if (!sessionId) return;
    void openHistoryWindow(sessionId);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || historyRevision === null) return;
    void syncHistoryWindow(sessionId);
  }, [sessionId, historyRevision]);

  // A turn can finish after the last forward page was read, and the revision
  // does not move again. Re-read the tail once the run is idle so the
  // committed end replaces a cursor stuck on an unanswered tool call.
  useEffect(() => {
    if (!sessionId || runStatus !== "idle") return;
    void openHistoryWindow(sessionId);
  }, [sessionId, runStatus]);

  return history;
}
