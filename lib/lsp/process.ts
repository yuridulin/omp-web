import { spawn } from "node:child_process";
import { wrapWindowsScript } from "../omp/omp-cli";
import { createLspParser, encodeLspMessage, LspProtocolError } from "./framing";

/**
 * One language-server child process. Mirrors the kill idioms of
 * `lib/omp/rpc-process.ts`: a POSIX process group gets SIGTERM then SIGKILL,
 * and Windows children are terminated through `taskkill /T /F`.
 */

const STDERR_TAIL_LIMIT = 8 * 1024;
const KILL_GRACE_MS = 2_000;

export interface LspProcess {
  send(message: unknown): void;
  onMessage(listener: (message: unknown) => void): () => void;
  dispose(): Promise<void>;
  readonly alive: boolean;
  readonly stderrTail: string;
}

export interface SpawnLspProcessOptions {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  onExit?: (info: { code: number | null; signal: NodeJS.Signals | null }) => void;
}

function appendTail(tail: string, text: string): string {
  const next = tail + text;
  return next.length > STDERR_TAIL_LIMIT ? next.slice(next.length - STDERR_TAIL_LIMIT) : next;
}

export function spawnLspProcess(options: SpawnLspProcessOptions): LspProcess {
  const target = wrapWindowsScript(options.command, options.args);
  const child = spawn(target.file, target.args, {
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    detached: process.platform !== "win32",
  });

  let exited = false;
  let stderrTail = "";
  const listeners = new Set<(message: unknown) => void>();

  const finish = (code: number | null, signal: NodeJS.Signals | null): void => {
    if (exited) return;
    exited = true;
    options.onExit?.({ code, signal });
  };

  const killForProtocolError = (error: unknown): void => {
    const message = error instanceof Error ? error.message : String(error);
    stderrTail = appendTail(stderrTail, `LSP protocol error: ${message}\n`);
    void handle.dispose();
  };

  const feed = createLspParser((message) => {
    for (const listener of listeners) listener(message);
  });

  child.stdout.on("data", (chunk: Buffer) => {
    try {
      feed(chunk);
    } catch (error) {
      if (error instanceof LspProtocolError) killForProtocolError(error);
      else throw error;
    }
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderrTail = appendTail(stderrTail, chunk.toString("utf8"));
  });
  child.on("error", (error) => {
    stderrTail = appendTail(stderrTail, `LSP spawn error: ${error.message}\n`);
    finish(null, null);
  });
  child.on("close", (code, signal) => finish(code, signal));

  const handle: LspProcess = {
    send(message: unknown): void {
      if (exited || child.stdin.destroyed) return;
      try {
        child.stdin.write(encodeLspMessage(message));
      } catch {
        // A closed stdin means the server is gone; the close event reports it.
      }
    },
    onMessage(listener: (message: unknown) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: async (): Promise<void> => {
      if (exited) return;
      const pid = child.pid;
      if (pid === undefined) {
        finish(null, null);
        return;
      }
      if (process.platform === "win32") {
        // cmd.exe launches .cmd shims; /T kills the actual server too.
        const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
        killer.on("error", () => {});
      } else {
        try {
          process.kill(-pid, "SIGTERM");
        } catch {
          try {
            child.kill("SIGTERM");
          } catch {
            // already gone
          }
        }
      }
      await new Promise<void>((resolve) => {
        if (exited) {
          resolve();
          return;
        }
        const timer = setTimeout(() => {
          if (exited) return;
          try {
            if (process.platform === "win32") child.kill();
            else process.kill(-pid, "SIGKILL");
          } catch {
            // already gone
          }
          resolve();
        }, KILL_GRACE_MS);
        timer.unref?.();
        child.once("close", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
    get alive(): boolean {
      return !exited;
    },
    get stderrTail(): string {
      return stderrTail;
    },
  };

  // `dispose` uses the local binding; protocol errors before it is assigned
  // cannot happen (no data is read until the next tick).
  return handle;
}
