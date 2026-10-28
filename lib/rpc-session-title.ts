// Session title generation: native generate_title, then a quiet /rename fallback.
import { existsSync } from "fs";
import type { RpcProcess } from "./omp/rpc-process";
import type { RpcSessionState } from "./pi-types";
import { PROMPT_ACK_TIMEOUT_MS, RESTARTING_MESSAGE, WebRpcError } from "./rpc-command-dispatch";
import { isRecord } from "./type-guards";

/** Title generation is an LLM call on omp's side. */
const GENERATE_TITLE_TIMEOUT_MS = 60_000;
const RENAME_POLL_INTERVAL_MS = 500;
const RENAME_POLL_TIMEOUT_MS = 20_000;
/** Background title requests per session. omp declines low-signal openers
 * (a bare greeting), so a later turn of the same session retries. */
const AUTO_TITLE_MAX_ATTEMPTS = 3;
/** command_output lines printed by omp's argument-less `/rename`. */
export const RENAME_OUTPUT_RE = /^(Session renamed to |Could not generate a session title|Session name not changed|Rename failed:)/;

function titleFromResult(result: unknown): string | null {
  const value = typeof result === "string" ? result : isRecord(result) ? (result.title ?? result.name ?? result.sessionName) : null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

type NotifyRunningChange = (options?: { refreshSessionList?: boolean }) => void;

function unbound(name: string): never {
  throw new Error(`rpc session title is not bound (${name})`);
}

let notifyRunningChange: NotifyRunningChange = () => { unbound("notifyRunningChange"); };

export function bindSessionTitle(bindings: { notifyRunningChange: NotifyRunningChange }): void {
  notifyRunningChange = bindings.notifyRunningChange;
}

interface TitleSession {
  restarting: boolean;
  historyEditInFlight: boolean;
  historyMutationPendingCount: number;
  generateTitleUnsupported: boolean;
  autoTitleInFlight: boolean;
  quietRenameUntil: number;
  _sessionId: string;
  _sessionName: string | undefined;
  _sessionFile: string;
  autoTitleAttempts: Map<string, number>;
  proc: RpcProcess;
  isAlive(): boolean;
  isRunning(): boolean;
  send(command: Record<string, unknown>): Promise<unknown>;
  generateTitle(options?: { quiet?: boolean }): Promise<string | null>;
  generateSessionTitle(quiet?: boolean): Promise<string | null>;
  readSessionName(): Promise<string | null>;
  adoptSessionName(title: string): void;
  getStateWithTimeout(): Promise<RpcSessionState>;
  invalidateSessionLists(): void;
}

/**
 * Ask omp to generate a title for this session with its own title generator.
 * Prefers the native `generate_title` RPC command and falls back to the
 * argument-less `/rename` slash command. Returns null when omp cannot do
 * either right now (older omp, or the session is mid-run, where `/rename`
 * would be queued as a prompt). With `quiet`, the `/rename` fallback skips
 * the prompt bookkeeping (the UI never sees a run) and its output stays out
 * of the chat.
 */
export async function generateTitle(this: TitleSession, { quiet = false }: { quiet?: boolean } = {}): Promise<string | null> {
  if (this.restarting) throw new WebRpcError(RESTARTING_MESSAGE, "session_restarting");
  if (!this.isAlive()) throw new Error("Session is no longer running");

  if (this.historyEditInFlight) throw new WebRpcError("Wait for the history edit to finish", "session_busy");
  this.historyMutationPendingCount += 1;
  try {
    return await this.generateSessionTitle(quiet);
  } finally {
    this.historyMutationPendingCount -= 1;
  }
}

export async function generateSessionTitle(this: TitleSession, quiet = false): Promise<string | null> {
  if (!this.generateTitleUnsupported) {
    try {
      const result = await this.proc.sendCommand<unknown>({ type: "generate_title" }, GENERATE_TITLE_TIMEOUT_MS);
      const title = titleFromResult(result) ?? (await this.readSessionName());
      if (title) this.adoptSessionName(title);
      return title;
    } catch (error) {
      if (!(error instanceof Error && error.message.includes("Unknown command"))) throw error;
      this.generateTitleUnsupported = true;
    }
  }

  // `/rename` without arguments generates a title (omp >= 18.6). It is a
  // prompt, so it must never be sent while a run is in flight.
  if (this.isRunning()) return null;
  const before = (await this.readSessionName()) ?? "";
  if (quiet) {
    // omp saves the title before it prints the result, so the poll below can
    // finish first: the window closes on that output or on expiry instead.
    this.quietRenameUntil = Date.now() + GENERATE_TITLE_TIMEOUT_MS;
    await this.proc.sendCommand({ type: "prompt", message: "/rename" }, PROMPT_ACK_TIMEOUT_MS);
  } else {
    await this.send({ type: "prompt", message: "/rename" });
  }
  const deadline = Date.now() + RENAME_POLL_TIMEOUT_MS;
  let title = await this.readSessionName();
  while (!(title && title !== before) && Date.now() < deadline && this.isAlive()) {
    await new Promise((resolve) => setTimeout(resolve, RENAME_POLL_INTERVAL_MS));
    title = await this.readSessionName();
  }
  if (title) this.adoptSessionName(title);
  return title;
}

/**
 * omp does not title sessions on its own in RPC mode
 * (can1357/oh-my-pi#14616), so once a turn finishes, ask its title generator
 * to name an untitled session, as omp's terminal UI does.
 */
export function autoTitle(this: TitleSession): void {
  const sessionId = this._sessionId;
  if (!sessionId || this._sessionName || this.autoTitleInFlight) return;
  // omp writes the session file once the history holds an assistant message.
  if (!this._sessionFile || !existsSync(this._sessionFile)) return;
  const attempts = this.autoTitleAttempts.get(sessionId) ?? 0;
  if (attempts >= AUTO_TITLE_MAX_ATTEMPTS) return;
  this.autoTitleAttempts.set(sessionId, attempts + 1);
  this.autoTitleInFlight = true;
  this.generateTitle({ quiet: true })
    .catch((error) => {
      console.warn(`[omp-web] could not title session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
    })
    .finally(() => {
      this.autoTitleInFlight = false;
    });
}

export async function readSessionName(this: TitleSession): Promise<string | null> {
  const state = await this.getStateWithTimeout();
  const name = typeof state.sessionName === "string" ? state.sessionName.trim() : "";
  return name || null;
}

export function adoptSessionName(this: TitleSession, title: string): void {
  this._sessionName = title;
  this.invalidateSessionLists();
  notifyRunningChange({ refreshSessionList: true });
}
