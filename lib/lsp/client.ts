import { basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isRecord } from "../type-guards";
import { spawnLspProcess, type LspProcess } from "./process";
import type { LspLaunchCandidate } from "./server-resolution";
import type { LspDiagnostic } from "./types";

/**
 * One initialized language server for one workspace root. Speaks JSON-RPC over
 * the framed stdio stream from `process.ts`; document versions are tracked here
 * because the manager sends full-text changes.
 */

const START_TIMEOUT_MS = 15_000;
const SHUTDOWN_TIMEOUT_MS = 2_000;

export interface LspClientOptions {
  root: string;
  serverId: string;
  candidates: LspLaunchCandidate[];
  env?: Record<string, string>;
  onDiagnostics(path: string, diagnostics: LspDiagnostic[], version: number | null): void;
  onExit?(reason: string): void;
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

interface OpenDocument {
  languageId: string;
  version: number;
  uri: string;
}

function isFileUri(uri: string): boolean {
  return uri.startsWith("file:");
}

function normalizeRange(value: unknown): LspDiagnostic["range"] | null {
  if (!isRecord(value)) return null;
  const start = isRecord(value.start) ? value.start : null;
  const end = isRecord(value.end) ? value.end : null;
  if (!start || !end) return null;
  const startLine = start.line;
  const startCharacter = start.character;
  const endLine = end.line;
  const endCharacter = end.character;
  if (
    typeof startLine !== "number"
    || typeof startCharacter !== "number"
    || typeof endLine !== "number"
    || typeof endCharacter !== "number"
  ) {
    return null;
  }
  return {
    start: { line: startLine, character: startCharacter },
    end: { line: endLine, character: endCharacter },
  };
}

function normalizeDiagnostic(value: unknown): LspDiagnostic | null {
  if (!isRecord(value) || typeof value.message !== "string") return null;
  const range = normalizeRange(value.range);
  if (!range) return null;
  const diagnostic: LspDiagnostic = { range, message: value.message };
  const severity = value.severity;
  if (severity === 1 || severity === 2 || severity === 3 || severity === 4) diagnostic.severity = severity;
  const code = value.code;
  if (typeof code === "string" || typeof code === "number") diagnostic.code = code;
  if (typeof value.source === "string") diagnostic.source = value.source;
  return diagnostic;
}

export function normalizeLspDiagnostics(value: unknown): LspDiagnostic[] {
  if (!Array.isArray(value)) return [];
  const result: LspDiagnostic[] = [];
  for (const entry of value) {
    const diagnostic = normalizeDiagnostic(entry);
    if (diagnostic) result.push(diagnostic);
  }
  return result;
}

export class LspClient {
  private process: LspProcess | undefined;
  private started = false;
  private disposed = false;
  private nextId = 1;
  private readonly pending = new Map<number | string, PendingRequest>();
  private readonly documents = new Map<string, OpenDocument>();

  constructor(private readonly options: LspClientOptions) {}

  async start(): Promise<void> {
    if (this.started) return;
    if (this.disposed) throw new Error("Language server client is disposed");
    const failures: string[] = [];

    for (const candidate of this.options.candidates) {
      const proc = spawnLspProcess({
        command: candidate.command,
        args: candidate.args,
        cwd: this.options.root,
        env: this.options.env,
        onExit: (info) => {
          if (this.process !== proc) return;
          this.process = undefined;
          this.rejectPending(new Error("Language server exited"));
          if (this.disposed) return;
          const tail = proc.stderrTail.trim();
          const code = info.code === null ? "signal" : String(info.code);
          this.options.onExit?.(`Language server exited (${code} ${info.signal ?? ""})${tail ? `: ${tail}` : ""}`);
        },
      });
      this.process = proc;
      const off = proc.onMessage((message) => this.handleMessage(message));
      try {
        await this.request("initialize", this.initializeParams(), START_TIMEOUT_MS);
        this.send({ jsonrpc: "2.0", method: "initialized", params: {} });
        this.started = true;
        return;
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
        off();
        if (this.process === proc) this.process = undefined;
        await proc.dispose();
      }
    }

    throw new Error(`Language server failed to start: ${failures[failures.length - 1] ?? "no candidates"}`);
  }

  openDocument(path: string, languageId: string, text: string): void {
    const uri = pathToFileURL(path).href;
    this.documents.set(path, { languageId, version: 1, uri });
    this.send({
      jsonrpc: "2.0",
      method: "textDocument/didOpen",
      params: { textDocument: { uri, languageId, version: 1, text } },
    });
  }

  changeDocument(path: string, text: string): void {
    const document = this.documents.get(path);
    if (!document) return;
    const version = document.version + 1;
    document.version = version;
    this.send({
      jsonrpc: "2.0",
      method: "textDocument/didChange",
      params: {
        textDocument: { uri: document.uri, version },
        contentChanges: [{ text }],
      },
    });
  }

  closeDocument(path: string): void {
    const document = this.documents.get(path);
    if (!document) return;
    this.documents.delete(path);
    this.send({
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: { textDocument: { uri: document.uri } },
    });
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    const proc = this.process;
    if (proc?.alive) {
      try {
        await this.request("shutdown", null, SHUTDOWN_TIMEOUT_MS);
      } catch {
        // The server may already be gone.
      }
      proc.send({ jsonrpc: "2.0", method: "exit" });
    }
    this.disposed = true;
    this.process = undefined;
    this.rejectPending(new Error("Language server client disposed"));
    if (proc) await proc.dispose();
  }

  private initializeParams(): Record<string, unknown> {
    const rootUri = pathToFileURL(this.options.root).href;
    return {
      processId: process.pid,
      clientInfo: { name: "omp-web" },
      rootUri,
      workspaceFolders: [{ uri: rootUri, name: basename(this.options.root) }],
      capabilities: {
        workspace: { workspaceFolders: true, configuration: true },
        textDocument: {
          synchronization: { didSave: false },
          publishDiagnostics: { relatedInformation: true, versionSupport: true },
        },
      },
    };
  }

  private send(message: unknown): void {
    this.process?.send(message);
  }

  private request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    const proc = this.process;
    if (!proc) return Promise.reject(new Error("Language server is not running"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      timer.unref?.();
      this.pending.set(id, { resolve, reject, timer });
      proc.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  private settle(id: number | string, message: Record<string, unknown>): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    if (message.error !== undefined) {
      const detail = isRecord(message.error) && typeof message.error.message === "string"
        ? message.error.message
        : JSON.stringify(message.error);
      pending.reject(new Error(detail));
      return;
    }
    pending.resolve(message.result);
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private handleMessage(message: unknown): void {
    if (!isRecord(message)) return;
    const id = message.id;
    const method = message.method;
    if (typeof method === "string") {
      if (typeof id === "number" || typeof id === "string") {
        this.respond(id, method, message.params);
      } else if (method === "textDocument/publishDiagnostics") {
        this.publishDiagnostics(message.params);
      }
      return;
    }
    if (typeof id === "number" || typeof id === "string") this.settle(id, message);
  }

  private respond(id: number | string, method: string, params: unknown): void {
    let result: unknown = null;
    if (method === "workspace/configuration") {
      const items = isRecord(params) && Array.isArray(params.items) ? params.items : [];
      result = items.map(() => null);
    } else if (method === "workspace/workspaceFolders") {
      const rootUri = pathToFileURL(this.options.root).href;
      result = [{ uri: rootUri, name: basename(this.options.root) }];
    }
    this.send({ jsonrpc: "2.0", id, result });
  }

  private publishDiagnostics(params: unknown): void {
    if (!isRecord(params) || typeof params.uri !== "string" || !isFileUri(params.uri)) return;
    let path: string;
    try {
      path = fileURLToPath(params.uri);
    } catch {
      return;
    }
    const version = typeof params.version === "number" ? params.version : null;
    this.options.onDiagnostics(path, normalizeLspDiagnostics(params.diagnostics), version);
  }
}
