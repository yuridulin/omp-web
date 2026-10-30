/** Wire protocol for `/api/workspace/terminal` (see `server/index.ts`). */

import { isRecord } from "@/api/guards";

export type TerminalServerFrame =
  | { type: "created"; id: string; pid: number; cwd: string }
  | { type: "output"; data: string }
  | { type: "exit"; exitCode: number }
  | { type: "error"; error: string; code: string };

export const TERMINAL_SOCKET_PATH = "/api/workspace/terminal";

/** Total parser: every malformed or unknown frame yields `null`. */
export function parseTerminalFrame(raw: string): TerminalServerFrame | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || typeof value.type !== "string") return null;
  switch (value.type) {
    case "created": {
      if (typeof value.id !== "string" || typeof value.cwd !== "string") return null;
      if (typeof value.pid !== "number" || !Number.isFinite(value.pid)) return null;
      return { type: "created", id: value.id, pid: value.pid, cwd: value.cwd };
    }
    case "output":
      return typeof value.data === "string" ? { type: "output", data: value.data } : null;
    case "exit":
      return typeof value.exitCode === "number" && Number.isFinite(value.exitCode)
        ? { type: "exit", exitCode: value.exitCode }
        : null;
    case "error":
      return typeof value.error === "string" && typeof value.code === "string"
        ? { type: "error", error: value.error, code: value.code }
        : null;
    default:
      return null;
  }
}

/** `ws:`/`wss:` counterpart of the page origin for the terminal socket. */
export function terminalSocketUrl(location: { protocol: string; host: string }): string {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}${TERMINAL_SOCKET_PATH}`;
}
