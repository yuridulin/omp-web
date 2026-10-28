// Process lifetime for one omp child: handshake, idle and disconnect reaping, restart, and teardown.
import { existsSync } from "fs";
import { getAgentEnvOverrides } from "./omp/agent-env";
import { RpcProcess, type RpcFrame } from "./omp/rpc-process";
import { SESSION_EDIT_EXTENSION_PATH } from "./omp/session-edit";
import { GET_STATE_TIMEOUT_MS, RESTARTING_MESSAGE, WebRpcError } from "./rpc-command-dispatch";
import type { RpcSessionState } from "./pi-types";
import type { ExitedRpcSession, ProjectLaunchConfig } from "./types";

const IDLE_DESTROY_MS = 10 * 60 * 1000;
/**
 * How long a session may sit with **no web UI attached** before its omp child is
 * torn down. IDLE_DESTROY_MS (10min) is the backstop for a session that keeps
 * receiving traffic; this is the much faster path for "the user closed the tab
 * and walked away", so abandoned children don't hold a slot for 10 minutes.
 *
 * The floor is set by the *client*, not the server: when an SSE stream dies the
 * browser retries with capped backoff (`EVENT_STREAM_RETRY_MAX_MS` = 30s in
 * `hooks/useAgentSession-stream.ts`), and a backgrounded tab clamps its timers
 * to ~1/min. A window anywhere near 60s therefore races the reconnect and turns
 * a returning tab into a 409 "Session is not managed by omp-web" plus a cold
 * respawn. 120s keeps ~2x the retry ceiling and still reclaims 5x faster than
 * the idle backstop. Set `OMP_WEB_DISCONNECT_DESTROY_MS=0` to disable reaping
 * and fall back to IDLE_DESTROY_MS alone.
 */
export const DISCONNECT_DESTROY_MS = process.env.OMP_WEB_DISCONNECT_DESTROY_MS !== undefined
  ? Math.max(0, Number(process.env.OMP_WEB_DISCONNECT_DESTROY_MS) || 0)
  : 120_000;
const READY_TIMEOUT_MS = 120_000;

type NotifyRunningChange = (options?: { refreshSessionList?: boolean }) => void;

function unbound(name: string): never {
  throw new Error(`rpc session lifecycle is not bound (${name})`);
}

let notifyRunningChange: NotifyRunningChange = () => { unbound("notifyRunningChange"); };
let getExitedMap: () => Map<string, ExitedRpcSession> = () => unbound("getExitedMap");
let buildSessionSpawnArgs: (
  sessionFile: string,
  toolNames?: string[],
  advisor?: boolean,
  launchConfig?: ProjectLaunchConfig,
  modelOverride?: string,
) => string[] = () => unbound("buildSessionSpawnArgs");
let launchConfigForCwd: (cwd: string) => ProjectLaunchConfig | undefined = () => unbound("launchConfigForCwd");

export interface LifecycleBindings {
  notifyRunningChange: NotifyRunningChange;
  getExitedMap: () => Map<string, ExitedRpcSession>;
  buildSessionSpawnArgs: typeof buildSessionSpawnArgs;
  launchConfigForCwd: (cwd: string) => ProjectLaunchConfig | undefined;
}

/** Installed by rpc-manager so these bodies can reach the registry without importing it. */
export function bindSessionLifecycle(bindings: LifecycleBindings): void {
  notifyRunningChange = bindings.notifyRunningChange;
  getExitedMap = bindings.getExitedMap;
  buildSessionSpawnArgs = bindings.buildSessionSpawnArgs;
  launchConfigForCwd = bindings.launchConfigForCwd;
}

interface LifecycleSession {
  proc: RpcProcess;
  cwd: string;
  readonly recordedCwd: string | null;
  readonly advisorSpawned: boolean;
  readonly disconnectDestroyMs: number;
  handshaking: boolean;
  _alive: boolean;
  _sessionId: string;
  _sessionFile: string;
  initPromise: Promise<void> | null;
  destroyPromise: Promise<void> | null;
  unsubscribeFrames: (() => void) | null;
  expectedExitProc: RpcProcess | null;
  onDestroyCallback: (() => void) | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
  reapTimer: ReturnType<typeof setTimeout> | null;
  sessionFileSignalTimer: ReturnType<typeof setTimeout> | null;
  lastIdleReset: number;
  lastActivityAt: number;
  reapDeadline: number;
  pendingCommands: number;
  promptRunning: boolean;
  streaming: boolean;
  compacting: boolean;
  bashRunning: boolean;
  unsettled: boolean;
  responseObserved: boolean;
  responseRunActive: boolean;
  promptDispatchPendingCount: number;
  awaitingAgentStart: boolean;
  awaitingAgentStartDeadline: number;
  continuationGraceUntil: number;
  restarting: boolean;
  pendingUiRequests: { readonly size: number };
  pendingHostTools: { clear(): void };
  hostToolNames: { clear(): void };
  pendingHostUris: { clear(): void };
  hostUriSchemes: { clear(): void };
  extensionStatuses: { clear(): void };
  extensionWidgets: { clear(): void };
  mcpListWaiter: { reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null;
  isAlive(): boolean;
  isRunning(): boolean;
  hasSubscribers(): boolean;
  noteActivity(): void;
  armReap(): void;
  reapIfDisconnected(): void;
  resetIdleTimer(force?: boolean): void;
  initialize(): Promise<void>;
  start(): void;
  handleFrame(frame: RpcFrame): void;
  handleProcessExit(info: { code: number | null; signal: NodeJS.Signals | null; stderrTail: string }, sourceProc?: RpcProcess): void;
  getStateWithTimeout(): Promise<RpcSessionState>;
  applyIdentity(state: RpcSessionState): void;
  emit(event: { type: string; [key: string]: unknown }): void;
  publishNotifications(frame: Record<string, unknown>): void;
  clearLiveSnapshots(): void;
  resetStream(): void;
  clearPendingUiRequests(): void;
  destroy(reason?: string): void;
  destroyAndWait(reason?: string): Promise<void>;
}

/**
 * Any real use of the session: an attached UI, a command from an API route, or
 * a frame from the child. `resetIdleTimer()` is the single choke point for all
 * three (start(), handleFrame(), send()), so driving reaping from here means
 * the deadline can never drift away from what the session is actually doing.
 *
 * Deliberately does NOT touch a timer: only the *deadline* moves, and
 * `armReap` keeps at most one timer alive, so a 100fps token stream costs a
 * timestamp write instead of clearTimeout/setTimeout churn.
 */
export function noteActivity(this: LifecycleSession): void {
  this.lastActivityAt = Date.now();
  this.reapDeadline = this.lastActivityAt + this.disconnectDestroyMs;
  this.armReap();
}

export function armReap(this: LifecycleSession): void {
  if (this.reapTimer || this.disconnectDestroyMs <= 0) return;
  if (this.hasSubscribers() || !this.isAlive()) return;
  this.reapTimer = setTimeout(() => {
    this.reapTimer = null;
    this.reapIfDisconnected();
  }, Math.max(0, this.reapDeadline - Date.now()));
  // Never pin the event loop for a cleanup deadline (cf. the MCP waiter and
  // lib/session-resume.ts): an unref'd reap must not delay process exit.
  this.reapTimer.unref?.();
}

/**
 * Tear the child down only when nobody can observe the loss. Every condition
 * here is a hard invariant, not a heuristic:
 *  - a subscriber means an open HTTP 200 stream that `destroy()` would leave
 *    half-open (the route holds its own detach + heartbeat), so the run would
 *    vanish silently and the tab would only notice via a later 409;
 *  - isRunning() covers an in-flight turn that no listener is watching;
 *  - handshaking covers a spawn that has not finished its startup handshake;
 *  - pendingCommands covers a route command (predict_word, mcp list, export)
 *    whose response the child still owes us;
 *  - the deadline check absorbs activity that landed while this fired.
 * Anything else keeps the session and re-arms for the remaining window.
 */
export function reapIfDisconnected(this: LifecycleSession): void {
  if (!this.isAlive() || this.hasSubscribers() || this.isRunning()
    || this.handshaking || this.pendingCommands > 0) {
    // A paused human dialog produces no frames. Do not spin a zero-delay
    // timer once the old deadline has passed while protected work remains.
    this.reapDeadline = Math.max(this.reapDeadline, Date.now() + this.disconnectDestroyMs);
    this.armReap();
    return;
  }
  if (Date.now() < this.reapDeadline) {
    this.reapDeadline = this.lastActivityAt + this.disconnectDestroyMs;
    this.armReap();
    return;
  }
  console.info("[omp-web] automatic-session-cleanup", JSON.stringify({ sessionId: this._sessionId, reason: "disconnected-idle", at: new Date().toISOString() }));
  this.destroy("disconnected-idle");
}

export function start(this: LifecycleSession): void {
  this.unsubscribeFrames = this.proc.onFrame((frame) => this.handleFrame(frame));
  this.resetIdleTimer();
  notifyRunningChange();
}

/** Resolves once the child announced readiness and identity is known. */
export function waitUntilReady(this: LifecycleSession): Promise<void> {
  if (!this.initPromise) this.initPromise = this.initialize();
  return this.initPromise;
}

export async function initialize(this: LifecycleSession): Promise<void> {
  // READY_TIMEOUT_MS and the reap window are the same order of magnitude, so
  // the handshake itself counts as in-flight work: a child that is slow to
  // announce itself must be torn down by its own startup timeout (which
  // reports a real error), never by the reaper.
  this.handshaking = true;
  try {
    const ready = await this.proc.waitReady(READY_TIMEOUT_MS);
    await this.proc.negotiateProtocol(ready);
    // Subscribe to subagent lifecycle/progress/event frames so the UI can show
    // a live subagent roster. Older omp builds may not know the command —
    // degrade silently (the UI falls back to no subagent info).
    await this.proc.sendCommand({ type: "set_subagent_subscription", level: "events" }).catch(() => {});
    // Opt into omp's all-questions ask dialog; older omp rejects the command
    // and keeps the per-question select/editor fallback.
    // Bounded like get_state so a child that never answers cannot stall startup.
    await this.proc.sendCommand({ type: "set_ask_dialog", enabled: true }, GET_STATE_TIMEOUT_MS).catch(() => {});
    const state = await this.getStateWithTimeout();
    this.applyIdentity(state);
    // Warn when the spawn cwd differs from the session's recorded directory.
    // This happens when the recorded cwd was deleted (removed worktree, moved
    // repo, different machine): resolveSpawnCwd silently substituted a live
    // directory so omp can spawn, but without a notice the user would see the
    // sidebar/header still advertise the (gone) recorded path while file tool
    // calls operate on a different tree.
    if (this.recordedCwd && this.recordedCwd !== this.cwd) {
      this.emit({
        type: "notice",
        level: "warning",
        message: `This session's working directory no longer exists; the agent is running in ${this.cwd}.`,
      });
    }
  } finally {
    this.handshaking = false;
    // The handshake is real activity, so the reap clock restarts from here
    // rather than from spawn (a slow start must not eat the whole window).
    this.noteActivity();
  }
}

export function handleProcessExit(this: LifecycleSession, { code, signal, stderrTail }: { code: number | null; signal: NodeJS.Signals | null; stderrTail: string }, sourceProc: RpcProcess = this.proc): void {
  if (!this._alive || sourceProc === this.expectedExitProc) return;
  const detail = (stderrTail.trim().split("\n").pop() ?? "").slice(-500);
  const status = signal ? `signal ${signal}` : `code ${code ?? "null"}`;
  // Recorded before destroy(): its running-change broadcast must carry the
  // record so sidebars that missed the notice below still see the exit.
  if (this._sessionId) getExitedMap().set(this._sessionId, { id: this._sessionId, cwd: this.cwd, at: Date.now(), code, signal, detail });
  this.emit({
    type: "notice",
    level: "error",
    message: `The omp process for this session exited unexpectedly (${status})${detail ? `: ${detail}` : "."}`,
  });
  // Terminal agent_end so a client mid-stream stops spinning immediately
  // instead of waiting for the reconcile poll.
  if (this.streaming || this.promptRunning) this.emit({ type: "agent_end", isTerminal: true, messages: [] });
  if (this.streaming || this.promptRunning || this.unsettled) {
    this.publishNotifications({ type: "process_exit", detail: detail || status });
  }
  this.destroy();
}

export function resetIdleTimer(this: LifecycleSession, force = false): void {
  // The single activity choke point: start(), every child frame, and every
  // send() land here, so this is where "someone is using this session" is
  // observed. Tracked before the throttle below, which only limits timer
  // churn — it must never hide activity from the reaper.
  this.noteActivity();
  const now = Date.now();
  if (!force && this.idleTimer && now - this.lastIdleReset < 5000) {
    return;
  }
  this.lastIdleReset = now;
  if (this.idleTimer) clearTimeout(this.idleTimer);
  this.idleTimer = setTimeout(() => {
    if (this.isRunning() || this.handshaking || this.pendingCommands > 0) {
      this.resetIdleTimer(true);
      return;
    }
    console.info("[omp-web] automatic-session-cleanup", JSON.stringify({ sessionId: this._sessionId, reason: "idle-timeout", at: new Date().toISOString() }));
    this.destroy("idle-timeout");
  }, IDLE_DESTROY_MS);
  // A cleanup deadline must not keep the process alive; the registry's
  // process-exit handler disposes every child anyway.
  this.idleTimer.unref?.();
}

/** Destroy and resolve only after the omp child has fully exited. Callers
 * that delete the session file afterwards must await this — omp flushes
 * session state on shutdown and would otherwise recreate the file. */
export async function destroyAndWait(this: LifecycleSession, reason = "unspecified"): Promise<void> {
  // Re-entrant calls join the in-flight dispose; without this a new spawn
  // can overlap the old child's shutdown (see startRpcSession).
  if (this.destroyPromise) return this.destroyPromise;
  if (!this._alive) return;
  console.info("[omp-web] session-dispose", JSON.stringify({ sessionId: this._sessionId, reason, running: this.isRunning(), pendingDialogs: this.pendingUiRequests.size, at: new Date().toISOString(), caller: new Error().stack?.split("\n").slice(2, 5).map((line) => line.trim()) }));
  this._alive = false;
  this.streaming = false;
  this.promptRunning = false;
  this.compacting = false;
  this.responseObserved = false;
  this.responseRunActive = false;
  this.clearLiveSnapshots();
  if (this.idleTimer) clearTimeout(this.idleTimer);
  if (this.reapTimer) {
    clearTimeout(this.reapTimer);
    this.reapTimer = null;
  }
  if (this.sessionFileSignalTimer) {
    clearTimeout(this.sessionFileSignalTimer);
    this.sessionFileSignalTimer = null;
  }
  this.unsubscribeFrames?.();
  this.clearPendingUiRequests();
  this.promptDispatchPendingCount = 0;
  this.awaitingAgentStart = false;
  this.awaitingAgentStartDeadline = 0;
  this.continuationGraceUntil = 0;
  if (this.mcpListWaiter) {
    clearTimeout(this.mcpListWaiter.timer);
    this.mcpListWaiter.reject(new Error("Session was closed while loading MCP servers"));
    this.mcpListWaiter = null;
  }
  const disposed = this.proc.dispose().catch(() => {});
  this.destroyPromise = disposed;
  this.pendingHostTools.clear();
  this.hostToolNames.clear();
  this.pendingHostUris.clear();
  this.hostUriSchemes.clear();
  notifyRunningChange();
  await disposed;
  this.onDestroyCallback?.();
}

export function destroy(this: LifecycleSession, reason = "unspecified"): void {
  void this.destroyAndWait(reason);
}

/** Full restart of the child process against the same session file. This is
 * omp-web's `reload`: extensions, skills, prompts, and tools are rediscovered
 * on boot, matching a fresh CLI launch. */
export async function restart(this: LifecycleSession): Promise<void> {
  if (this.restarting) throw new WebRpcError(RESTARTING_MESSAGE, "session_restarting");
  const sessionFile = this._sessionFile;
  const resumable = !!sessionFile && existsSync(sessionFile);
  const old = this.proc;
  // Stays true for the whole restart so send() rejects commands that would
  // otherwise hit the disposed or half-built child.
  this.restarting = true;
  this.resetStream();
  this.streaming = false;
  this.promptRunning = false;
  this.compacting = false;
  this.unsubscribeFrames?.();
  try {
    this.expectedExitProc = old;
    try {
      await old.dispose();
    } finally {
      if (this.expectedExitProc === old) this.expectedExitProc = null;
    }
    if (!this._alive) return;

    this.extensionStatuses.clear();
    this.extensionWidgets.clear();
    this.clearPendingUiRequests();
    this.promptRunning = false;
    this.promptDispatchPendingCount = 0;
    this.awaitingAgentStart = false;
    this.awaitingAgentStartDeadline = 0;
    this.continuationGraceUntil = 0;
    this.bashRunning = false;
    this.streaming = false;
    this.compacting = false;
    const proc = new RpcProcess({
      cwd: this.cwd,
      // Re-read per spawn so a restart picks up environment values the user
      // added in Settings after this session was created (#104).
      env: getAgentEnvOverrides(),
      extraArgs: [...buildSessionSpawnArgs(resumable ? sessionFile : "", undefined, this.advisorSpawned, launchConfigForCwd(this.cwd)), "--extension", SESSION_EDIT_EXTENSION_PATH],
      onExit: (info) => {
        if (this.proc === proc) this.handleProcessExit(info, proc);
      },
    });
    this.proc = proc;
    this.unsubscribeFrames = proc.onFrame((frame) => this.handleFrame(frame));
    try {
      const ready = await proc.waitReady(READY_TIMEOUT_MS);
      await proc.negotiateProtocol(ready);
      // The replacement process starts with subscriptions disabled; restore
      // the live roster/transcript event stream before reading its state.
      await proc.sendCommand({ type: "set_subagent_subscription", level: "events" }).catch(() => {});
      await proc.sendCommand({ type: "set_ask_dialog", enabled: true }, GET_STATE_TIMEOUT_MS).catch(() => {});
      const state = await proc.sendCommand<RpcSessionState>({ type: "get_state" }, GET_STATE_TIMEOUT_MS);
      this.applyIdentity(state);
      // Same fresh-spawn guard as startRpcSession: a sessionless wrapper
      // restarts bare, and omp's startup resume handling could land it on the
      // cwd's most recent session. An on-disk session file is the resume
      // signal (fresh children report a not-yet-created path).
      if (!resumable && this._sessionFile && existsSync(this._sessionFile)) {
        await proc.sendCommand({ type: "new_session" });
        this.applyIdentity(await proc.sendCommand<RpcSessionState>({ type: "get_state" }, GET_STATE_TIMEOUT_MS));
      }
    } catch (error) {
      // Never leave the replacement running with nobody reading its frames.
      this.unsubscribeFrames?.();
      this.unsubscribeFrames = null;
      void proc.dispose();
      // The wrapper has no usable child left; drop it from the registry so the
      // next request starts a fresh session instead of reusing a corpse.
      this.destroy();
      throw error;
    }
  } finally {
    this.restarting = false;
  }
  notifyRunningChange();
}
