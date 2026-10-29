import { randomUUID } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import type * as PtyModule from "node-pty";
import { getAllowedFileRoots, isExistingFilePathAllowed } from "./file-access";
import { createChildProcessEnvironment } from "./project-command-env";

/**
 * PTY sessions for tasks outside omp (dev servers, tests, git). One real shell
 * per WebSocket connection; the server owns the process and the output ring.
 */

const MAX_TERMINALS = 8;
const MAX_BUFFER_CHARS = 256 * 1024;
const MAX_INPUT_CHARS = 64 * 1024;
const MIN_DIMENSION = 2;
const MAX_DIMENSION = 500;

export class TerminalError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "TerminalError";
    this.code = code;
    this.status = status;
  }
}

export interface TerminalSession {
  readonly id: string;
  readonly pid: number;
  readonly cwd: string;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(listener: (data: string) => void): () => void;
  onExit(listener: (exitCode: number) => void): () => void;
}

interface ManagedTerminal extends TerminalSession {
  readonly child: PtyModule.IPty;
  readonly chunks: string[];
  bufferedChars: number;
  exited: boolean;
}

const sessions = new Map<string, ManagedTerminal>();

/**
 * node-pty is a native, optional module: loading it eagerly would take the
 * whole server down on a platform without a build. Import it on the first
 * terminal instead and report the failure as a terminal error.
 */
let ptyModule: Promise<typeof PtyModule> | null = null;

function loadPty(): Promise<typeof PtyModule> {
  if (!ptyModule) {
    ptyModule = import("node-pty").catch((error: unknown) => {
      ptyModule = null;
      throw new TerminalError(
        `PTY support is unavailable: ${error instanceof Error ? error.message : String(error)}`,
        "pty_unavailable",
        501,
      );
    });
  }
  return ptyModule;
}

function dimension(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, Math.trunc(value)));
}

function defaultShell(): string {
  if (process.platform === "win32") return process.env.ComSpec || "cmd.exe";
  return process.env.SHELL || "/bin/bash";
}

function killTree(child: PtyModule.IPty): void {
  try {
    if (process.platform === "win32") {
      // node-pty's own kill runs a console-list helper that crashes noisily
      // under Bun; taskkill terminates the shell and its children directly.
      Bun.spawnSync(["taskkill", "/PID", String(child.pid), "/T", "/F"], {
        stdout: "ignore",
        stderr: "ignore",
      });
    } else {
      process.kill(child.pid, "SIGKILL");
      child.kill();
    }
  } catch {
    // The shell may already be gone.
  }
}

async function createManaged(id: string, cwd: string, cols: number, rows: number): Promise<ManagedTerminal> {
  const pty = await loadPty();
  const child = pty.spawn(defaultShell(), [], {
    name: "xterm-256color",
    cols,
    rows,
    cwd,
    env: createChildProcessEnvironment({
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    }),
  });

  const dataListeners = new Set<(data: string) => void>();
  const exitListeners = new Set<(exitCode: number) => void>();
  const chunks: string[] = [];

  const terminal: ManagedTerminal = {
    id,
    pid: child.pid,
    cwd,
    child,
    chunks,
    bufferedChars: 0,
    exited: false,
    write(data) {
      if (terminal.exited) throw new TerminalError("Terminal has exited", "terminal_exited", 409);
      if (typeof data !== "string" || data.length === 0) return;
      if (data.length > MAX_INPUT_CHARS) {
        throw new TerminalError("Terminal input is too large", "terminal_input_too_large", 413);
      }
      child.write(data);
    },
    resize(nextCols, nextRows) {
      if (terminal.exited) return;
      try {
        child.resize(dimension(nextCols, cols), dimension(nextRows, rows));
      } catch {
        // A shell that just exited may reject the resize; the exit follows.
      }
    },
    kill() {
      if (terminal.exited) return;
      killTree(child);
    },
    onData(listener) {
      dataListeners.add(listener);
      return () => {
        dataListeners.delete(listener);
      };
    },
    onExit(listener) {
      exitListeners.add(listener);
      return () => {
        exitListeners.delete(listener);
      };
    },
  };

  child.onData((data) => {
    chunks.push(data);
    terminal.bufferedChars += data.length;
    while (terminal.bufferedChars > MAX_BUFFER_CHARS && chunks.length > 1) {
      terminal.bufferedChars -= chunks.shift()!.length;
    }
    for (const listener of dataListeners) {
      try {
        listener(data);
      } catch {
        // One socket failure must not stop the others.
      }
    }
  });
  child.onExit(({ exitCode }) => {
    terminal.exited = true;
    sessions.delete(id);
    for (const listener of exitListeners) {
      try {
        listener(exitCode);
      } catch {
        // Ignore a listener that already detached.
      }
    }
  });

  return terminal;
}

export interface CreateTerminalOptions {
  cwd: unknown;
  cols?: unknown;
  rows?: unknown;
}

export async function createTerminal(options: CreateTerminalOptions): Promise<TerminalSession> {
  if (sessions.size >= MAX_TERMINALS) {
    throw new TerminalError("Too many terminals", "too_many_terminals", 429);
  }
  if (typeof options.cwd !== "string" || !options.cwd.trim()) {
    throw new TerminalError("cwd is required", "cwd_required", 400);
  }
  const cwd = options.cwd.trim();
  let stat;
  try {
    stat = statSync(cwd);
  } catch {
    throw new TerminalError("Directory not found", "directory_not_found", 404);
  }
  if (!stat.isDirectory()) {
    throw new TerminalError("Not a directory", "not_a_directory", 400);
  }
  const roots = await getAllowedFileRoots();
  if (!isExistingFilePathAllowed(cwd, roots)) {
    throw new TerminalError("Access denied", "access_denied", 403);
  }
  if (!existsSync(cwd)) {
    throw new TerminalError("Directory not found", "directory_not_found", 404);
  }

  const terminal = await createManaged(
    randomUUID(),
    cwd,
    dimension(options.cols, 80),
    dimension(options.rows, 24),
  );
  sessions.set(terminal.id, terminal);
  return terminal;
}

export function getTerminal(id: string): TerminalSession | null {
  return sessions.get(id) ?? null;
}

/** Buffered output, for a client that attaches after creation. */
export function terminalBuffer(terminal: TerminalSession): string {
  const managed = sessions.get(terminal.id);
  return managed ? managed.chunks.join("") : "";
}
