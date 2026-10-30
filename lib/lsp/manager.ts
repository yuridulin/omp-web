import { resolve } from "node:path";
import { loadWebServerSettings } from "../web-settings";
import { LspClient, type LspClientOptions } from "./client";
import { resolveLspServer, type LspLaunchCandidate, type LspResolution } from "./server-resolution";
import type { LspDiagnostic, LspSettings } from "./types";

/**
 * Owns every language-server process. One entry per workspace root; within a
 * root one client per distinct server id (a root may hold both TypeScript and
 * C# files). Documents are tracked here so the HTTP route and the editor can
 * agree on versions, limits and diagnostics.
 */

export const LSP_MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
export const LSP_MAX_DOCUMENTS_PER_ROOT = 200;
export const LSP_MAX_ROOTS = 4;
export const LSP_IDLE_MS = 5 * 60_000;
export const LSP_START_FAILURE_TTL_MS = 30_000;

export type LspDocumentResult =
  | { ok: true; server: string; version: number }
  | {
      ok: false;
      reason:
        | "disabled"
        | "unsupported_language"
        | "missing_server"
        | "server_failed"
        | "document_limit"
        | "root_limit"
        | "document_not_open";
      hint?: string;
      error?: string;
    };

export interface LspDiagnosticsSnapshot {
  available: boolean;
  server: string | null;
  diagnostics: LspDiagnostic[];
  version: number | null;
}

export interface LspUpdate {
  root: string;
  path: string;
  diagnostics: LspDiagnostic[];
  version: number;
}

export interface LspClientLike {
  start(): Promise<void>;
  openDocument(path: string, languageId: string, text: string): void;
  changeDocument(path: string, text: string): void;
  closeDocument(path: string): void;
  dispose(): Promise<void>;
}

export type LspClientFactory = (options: LspClientOptions) => LspClientLike;

interface TrackedDocument {
  /** Canonical path with the caller's casing; sent to the server. */
  path: string;
  languageId: string;
  version: number;
}

interface ClientState {
  /** Server id for display; the map key also covers the launch definition. */
  id: string;
  key: string;
  candidates: LspLaunchCandidate[];
  env?: Record<string, string>;
  client: LspClientLike | undefined;
  connecting: Promise<void> | null;
  documents: Map<string, TrackedDocument>;
}

interface RootEntry {
  root: string;
  clients: Map<string, ClientState>;
  diagnostics: Map<string, { diagnostics: LspDiagnostic[]; version: number; server: string }>;
  /** Documents whose first open is still waiting for the client to start. */
  opening: Set<string>;
  /** Close requests that arrived while the document was still opening. */
  pendingClose: Set<string>;
  idleTimer: NodeJS.Timeout | undefined;
  closed: boolean;
}

interface Failure {
  until: number;
  error: string;
}

type Listener = (update: LspUpdate) => void;

const entries = new Map<string, RootEntry>();
const failures = new Map<string, Failure>();
const listeners = new Map<string, Set<Listener>>();

let clientFactory: LspClientFactory = (options) => new LspClient(options);

/** Test seam: inject a fake client; `null` restores the real one. */
export function setLspClientFactory(factory: LspClientFactory | null): void {
  clientFactory = factory ?? ((options) => new LspClient(options));
}

function rootKey(root: string): string {
  const resolved = resolve(root);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function pathKey(path: string): string {
  const resolved = resolve(path);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function documentCount(entry: RootEntry): number {
  let count = 0;
  for (const state of entry.clients.values()) count += state.documents.size;
  return count;
}

function failureKey(root: string, serverId: string): string {
  return `${rootKey(root)}\0${serverId}`;
}

function subscribeRoot(entryRoot: string, listener: Listener): () => void {
  const key = rootKey(entryRoot);
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}

function notify(entry: RootEntry, path: string, diagnostics: LspDiagnostic[], version: number): void {
  const set = listeners.get(rootKey(entry.root));
  if (!set) return;
  for (const listener of set) {
    try {
      listener({ root: entry.root, path, diagnostics, version });
    } catch {
      // A broken SSE subscriber must not break diagnostics fan-out.
    }
  }
}

function scheduleIdle(entry: RootEntry): void {
  if (entry.idleTimer) clearTimeout(entry.idleTimer);
  entry.idleTimer = setTimeout(() => {
    entry.idleTimer = undefined;
    if (!entry.closed && documentCount(entry) === 0) disposeEntry(entry);
  }, LSP_IDLE_MS);
  entry.idleTimer.unref?.();
}

function disposeEntry(entry: RootEntry): void {
  if (entry.closed) return;
  entry.closed = true;
  if (entry.idleTimer) clearTimeout(entry.idleTimer);
  entry.idleTimer = undefined;
  entries.delete(rootKey(entry.root));
  for (const state of entry.clients.values()) {
    state.documents.clear();
    if (state.client) void state.client.dispose();
    state.client = undefined;
  }
  entry.opening.clear();
  entry.pendingClose.clear();
  entry.clients.clear();
  entry.diagnostics.clear();
}

function evictIdleEntry(): boolean {
  for (const entry of entries.values()) {
    if (documentCount(entry) === 0) {
      disposeEntry(entry);
      return true;
    }
  }
  return false;
}

function toFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function handleDiagnostics(
  entry: RootEntry,
  state: ClientState,
  path: string,
  diagnostics: LspDiagnostic[],
  version: number | null,
): void {
  if (entry.closed) return;
  const key = pathKey(path);
  const tracked = state.documents.get(key);
  if (!tracked) return;
  const resolvedVersion = version ?? tracked.version;
  entry.diagnostics.set(key, { diagnostics, version: resolvedVersion, server: state.id });
  notify(entry, tracked.path, diagnostics, resolvedVersion);
}

function handleExit(entry: RootEntry, state: ClientState, client: LspClientLike | undefined, reason: string): void {
  if (entry.closed || state.client !== client) return;
  state.client = undefined;
  failures.set(failureKey(entry.root, state.key), {
    until: Date.now() + LSP_START_FAILURE_TTL_MS,
    error: reason,
  });
  const closed = [...state.documents.entries()];
  state.documents.clear();
  for (const [path, tracked] of closed) {
    entry.diagnostics.delete(path);
    notify(entry, tracked.path, [], 0);
  }
  if (documentCount(entry) === 0) scheduleIdle(entry);
}

async function ensureClient(entry: RootEntry, state: ClientState): Promise<void> {
  if (state.client) return;
  if (state.connecting) return state.connecting;
  const failureKeyValue = failureKey(entry.root, state.key);
  const failure = failures.get(failureKeyValue);
  if (failure && failure.until > Date.now()) throw new Error(failure.error);

  let client: LspClientLike | undefined;
  const promise = (async () => {
    client = clientFactory({
      root: entry.root,
      serverId: state.id,
      candidates: state.candidates,
      env: state.env,
      onDiagnostics: (path, diagnostics, version) => {
        if (client) handleDiagnostics(entry, state, path, diagnostics, version);
      },
      onExit: (reason) => handleExit(entry, state, client, reason),
    });
    try {
      await client.start();
    } catch (error) {
      const message = toFailureMessage(error);
      failures.set(failureKeyValue, { until: Date.now() + LSP_START_FAILURE_TTL_MS, error: message });
      throw error;
    }
    if (entry.closed) {
      void client.dispose();
      throw new Error("Workspace root closed");
    }
    state.client = client;
    failures.delete(failureKeyValue);
  })();
  state.connecting = promise;
  try {
    await promise;
  } finally {
    if (state.connecting === promise) state.connecting = null;
  }
}

function stateFor(entry: RootEntry, resolution: Extract<LspResolution, { ok: true }>): ClientState {
  // A saved edit to the same id is a different launch definition: keep the old
  // documents on their running server and start the new one for new opens.
  const key = JSON.stringify([resolution.id, resolution.candidates, resolution.env ?? null]);
  let state = entry.clients.get(key);
  if (!state) {
    state = {
      id: resolution.id,
      key,
      candidates: resolution.candidates,
      env: resolution.env,
      client: undefined,
      connecting: null,
      documents: new Map(),
    };
    entry.clients.set(key, state);
  }
  return state;
}

function closeTracked(entry: RootEntry, state: ClientState, path: string): void {
  const tracked = state.documents.get(path);
  if (!tracked) return;
  state.client?.closeDocument(tracked.path);
  state.documents.delete(path);
  entry.diagnostics.delete(path);
  notify(entry, tracked.path, [], 0);
}

export async function openLspDocument(input: {
  root: string;
  path: string;
  languageId: string;
  text: string;
}): Promise<LspDocumentResult> {
  if (Buffer.byteLength(input.text, "utf8") > LSP_MAX_DOCUMENT_BYTES) {
    return { ok: false, reason: "document_limit", hint: "Document exceeds 2 MiB." };
  }
  const settings: LspSettings = loadWebServerSettings().lsp;
  const resolution = resolveLspServer(input.languageId, settings);
  if (!resolution.ok) {
    return resolution.hint
      ? { ok: false, reason: resolution.reason, hint: resolution.hint }
      : { ok: false, reason: resolution.reason };
  }

  const key = rootKey(input.root);
  let entry = entries.get(key);
  if (!entry) {
    if (entries.size >= LSP_MAX_ROOTS && !evictIdleEntry()) {
      return { ok: false, reason: "root_limit", hint: `At most ${LSP_MAX_ROOTS} workspace roots keep language servers open.` };
    }
    entry = {
      root: resolve(input.root),
      clients: new Map(),
      diagnostics: new Map(),
      opening: new Set(),
      pendingClose: new Set(),
      idleTimer: undefined,
      closed: false,
    };
    ensureShutdownHook();
    entries.set(key, entry);
  }
  if (entry.idleTimer) {
    clearTimeout(entry.idleTimer);
    entry.idleTimer = undefined;
  }

  const state = stateFor(entry, resolution);
  const canonicalPath = resolve(input.path);
  const path = pathKey(input.path);

  // A path belongs to exactly one server definition; re-opening under another
  // id or a changed definition closes the old tracking first.
  for (const [key, other] of entry.clients) {
    if (key !== state.key && other.documents.has(path)) closeTracked(entry, other, path);
  }

  const tracked = state.documents.get(path);
  if (tracked && state.client) {
    state.client.changeDocument(tracked.path, input.text);
    tracked.version += 1;
    return { ok: true, server: state.id, version: tracked.version };
  }

  if (documentCount(entry) >= LSP_MAX_DOCUMENTS_PER_ROOT) {
    return { ok: false, reason: "document_limit", hint: `At most ${LSP_MAX_DOCUMENTS_PER_ROOT} documents per root.` };
  }

  entry.opening.add(path);
  try {
    await ensureClient(entry, state);
  } catch (error) {
    entry.opening.delete(path);
    entry.pendingClose.delete(path);
    if (documentCount(entry) === 0) scheduleIdle(entry);
    return { ok: false, reason: "server_failed", error: toFailureMessage(error) };
  }
  entry.opening.delete(path);
  // The tab may have closed while the server was starting; do not adopt a
  // document that nobody owns.
  if (entry.pendingClose.delete(path)) {
    if (documentCount(entry) === 0) scheduleIdle(entry);
    return { ok: false, reason: "document_not_open" };
  }
  if (!state.client) return { ok: false, reason: "server_failed", error: "Language server is not running" };

  state.client.openDocument(canonicalPath, input.languageId, input.text);
  state.documents.set(path, { path: canonicalPath, languageId: input.languageId, version: 1 });
  return { ok: true, server: state.id, version: 1 };
}

export function changeLspDocument(input: { root: string; path: string; text: string }): LspDocumentResult {
  if (Buffer.byteLength(input.text, "utf8") > LSP_MAX_DOCUMENT_BYTES) {
    return { ok: false, reason: "document_limit", hint: "Document exceeds 2 MiB." };
  }
  const entry = entries.get(rootKey(input.root));
  if (!entry) return { ok: false, reason: "document_not_open" };
  const path = pathKey(input.path);
  for (const state of entry.clients.values()) {
    const tracked = state.documents.get(path);
    if (!tracked || !state.client) continue;
    state.client.changeDocument(tracked.path, input.text);
    tracked.version += 1;
    return { ok: true, server: state.id, version: tracked.version };
  }
  return { ok: false, reason: "document_not_open" };
}

export function closeLspDocument(input: { root: string; path: string }): void {
  const entry = entries.get(rootKey(input.root));
  if (!entry) return;
  const path = pathKey(input.path);
  let found = false;
  for (const state of entry.clients.values()) {
    if (!state.documents.has(path)) continue;
    closeTracked(entry, state, path);
    found = true;
  }
  if (!found && entry.opening.has(path)) entry.pendingClose.add(path);
  if (documentCount(entry) === 0) scheduleIdle(entry);
}

export function getLspDiagnostics(root: string, path: string): LspDiagnosticsSnapshot {
  const entry = entries.get(rootKey(root));
  if (!entry) return { available: false, server: null, diagnostics: [], version: null };
  const key = pathKey(path);
  for (const state of entry.clients.values()) {
    if (!state.documents.has(key)) continue;
    const published = entry.diagnostics.get(key);
    return {
      available: true,
      server: state.id,
      diagnostics: published?.diagnostics ?? [],
      version: published?.version ?? null,
    };
  }
  return { available: false, server: null, diagnostics: [], version: null };
}

export function subscribeLsp(root: string, listener: Listener): () => void {
  return subscribeRoot(root, listener);
}

/** Stop every language server (tests and process shutdown). */
export function disposeLsp(): void {
  for (const entry of [...entries.values()]) disposeEntry(entry);
  failures.clear();
  listeners.clear();
}

let shutdownHookInstalled = false;

/** Mirror the session registry: language servers must not outlive the server. */
function ensureShutdownHook(): void {
  if (shutdownHookInstalled) return;
  shutdownHookInstalled = true;
  const cleanup = () => disposeLsp();
  process.once("exit", cleanup);
  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);
}
