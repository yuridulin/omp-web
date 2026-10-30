import { useMemo, useSyncExternalStore } from "react";
import { comparablePath, isPathWithin } from "@/api/paths";
import type { LspDiagnostic } from "@/api/lsp";

/** Diagnostics per open document, fed by SSE and the initial HTTP snapshot. */

export interface LspDocumentState {
  root: string;
  path: string;
  server: string | null;
  available: boolean;
  version: number | null;
  diagnostics: LspDiagnostic[];
}

const documents = new Map<string, LspDocumentState>();
const listeners = new Set<() => void>();
let revision = 0;

function keyFor(root: string, path: string): string {
  return `${comparablePath(root)}\0${comparablePath(path)}`;
}

function emit(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

export function subscribeLspStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLspRevision(): number {
  return revision;
}

export function setLspDiagnostics(
  root: string,
  path: string,
  diagnostics: LspDiagnostic[],
  version: number | null,
  server: string | null = null,
): void {
  const key = keyFor(root, path);
  const previous = documents.get(key);
  if (
    previous
    && previous.version === version
    && previous.server === (server ?? previous.server)
    && sameDiagnostics(previous.diagnostics, diagnostics)
  ) {
    return;
  }
  documents.set(key, {
    root,
    path,
    server: server ?? previous?.server ?? null,
    available: true,
    version,
    diagnostics,
  });
  emit();
}

export function removeLspDiagnostics(root: string, path: string): void {
  if (documents.delete(keyFor(root, path))) emit();
}

export function clearLspRoot(root: string): void {
  let changed = false;
  for (const [key, document] of documents) {
    if (comparablePath(document.root) !== comparablePath(root)) continue;
    documents.delete(key);
    changed = true;
  }
  if (changed) emit();
}

function sameDiagnostics(left: readonly LspDiagnostic[], right: readonly LspDiagnostic[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (!a || !b) return false;
    if (a.message !== b.message || a.source !== b.source || a.severity !== b.severity) return false;
    if (
      a.range.start.line !== b.range.start.line
      || a.range.start.character !== b.range.start.character
      || a.range.end.line !== b.range.end.line
      || a.range.end.character !== b.range.end.character
    ) {
      return false;
    }
  }
  return true;
}

function parseDiagnostics(value: unknown): LspDiagnostic[] {
  if (!Array.isArray(value)) return [];
  const result: LspDiagnostic[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    if (!raw.range || typeof raw.range !== "object" || typeof raw.message !== "string") continue;
    const range = raw.range as Record<string, unknown>;
    const start = range.start as Record<string, unknown> | undefined;
    const end = range.end as Record<string, unknown> | undefined;
    if (
      !start
      || !end
      || typeof start.line !== "number"
      || typeof start.character !== "number"
      || typeof end.line !== "number"
      || typeof end.character !== "number"
    ) {
      continue;
    }
    const diagnostic: LspDiagnostic = {
      range: {
        start: { line: start.line, character: start.character },
        end: { line: end.line, character: end.character },
      },
      message: raw.message,
    };
    if (raw.severity === 1 || raw.severity === 2 || raw.severity === 3 || raw.severity === 4) {
      diagnostic.severity = raw.severity;
    }
    if (typeof raw.code === "string" || typeof raw.code === "number") diagnostic.code = raw.code;
    if (typeof raw.source === "string") diagnostic.source = raw.source;
    result.push(diagnostic);
  }
  return result;
}

/** Apply one `lsp-diagnostics` SSE frame; malformed frames are ignored. */
export function applyLspDiagnosticsFrame(frame: { type: string; [key: string]: unknown }): void {
  if (frame.type !== "lsp-diagnostics") return;
  const root = frame.root;
  const path = frame.path;
  if (typeof root !== "string" || typeof path !== "string") return;
  if (!Array.isArray(frame.diagnostics)) return;
  const version = typeof frame.version === "number" ? frame.version : null;
  const diagnostics = parseDiagnostics(frame.diagnostics);
  // The manager publishes `version: 0` with an empty list when a document
  // closes or its server exits; drop the entry instead of resurrecting it.
  if (version === 0 && diagnostics.length === 0) {
    removeLspDiagnostics(root, path);
    return;
  }
  setLspDiagnostics(root, path, diagnostics, version);
}

function snapshot(root: string | null, path: string | null): LspDocumentState | null {
  if (!root || !path) return null;
  return documents.get(keyFor(root, path)) ?? null;
}

export function useLspDiagnostics(root: string | null, path: string | null): LspDocumentState | null {
  const subscribe = (listener: () => void) => subscribeLspStore(listener);
  return useSyncExternalStore(
    subscribe,
    () => snapshot(root, path),
    () => null,
  );
}

export function useAllDiagnostics(roots: readonly string[]): LspDocumentState[] {
  const subscribe = (listener: () => void) => subscribeLspStore(listener);
  const currentRevision = useSyncExternalStore(subscribe, getLspRevision, () => 0);
  const rootsKey = roots.join("\n");
  return useMemo(() => {
    if (roots.length === 0) return [];
    const all = [...documents.values()].filter((document) =>
      roots.some((root) => isPathWithin(document.path, root)),
    );
    return all.sort((left, right) => left.path.localeCompare(right.path));
    // `currentRevision` is the change signal; `rootsKey` captures the root set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRevision, rootsKey]);
}
