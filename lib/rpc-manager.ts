import { randomUUID } from "crypto";
import { existsSync, realpathSync } from "fs";
import { homedir } from "os";
import { hasVisibleAssistantContent } from "./assistant-response";
import { RpcCommandTimeoutError, RpcProcess, type RpcFrame } from "./omp/rpc-process";
import { readNativeSettings } from "./omp/settings-config";
import { getAgentEnvOverrides } from "./omp/agent-env";
import { editSessionHistory, isSessionEditReply, SESSION_EDIT_COMMAND, SESSION_EDIT_EXTENSION_PATH, SessionEditAgentInvocationError, type SessionEditResult } from "./omp/session-edit";
import {
  cacheSessionPath,
  invalidateSessionEntriesCache,
  invalidateSessionListCache,
  invalidateSessionListMeta,
  listAllSessions,
  readSessionHeader,
  resolveSessionPath,
} from "./session-reader";
import { allowFileRoot } from "./file-access";
import { loadWebServerSettings } from "./web-settings";
import {
  AGENT_TOOL_DEFINITIONS,
  AGENT_TOOL_NAMES,
  AgentToolGuard,
  executeAgentTool,
  type AgentToolDeliverResult,
  type AgentToolSessionOps,
} from "./agent-tools";
import { markShuttingDown, recordRunningSessions, RESUME_PROMPT, takeInterruptedSessions } from "./session-resume";
import { PRESET_FULL } from "../core/tool-presets";
import { comparableProjectPath } from "./comparable-path";
import { samePath } from "./paths";
import { BLOCKING_UI_METHODS, createNotificationDetector } from "./notification-events";
import { publishNotification } from "./notification-hub";
import { parseSkillDiagnosticsSnapshot, type SkillDiagnosticsSnapshot } from "./skill-diagnostics";
import { isReservedLaunchArg, loadProjectRegistry } from "./project-registry";
import { eventWithToolResultImageUrls } from "./media-cache";
import type {
  RpcAvailableSlashCommand,
  RpcSessionState,
  WebSessionState,
} from "./pi-types";
import type { AgentMessage, CrossSessionHostToolCall, ExitedRpcSession, ExtensionWidgetItem, ProjectLaunchConfig } from "./types";
import type { SessionStreamCursor } from "./session-sync";
import { SessionAuthority } from "./session-authority";
import type { ChatIntent } from "../core/commands";
import type { DispatchResult, Snapshot } from "../core/machine";
import {
  bindCommandDispatch,
  dispatchCommand,
  GET_STATE_TIMEOUT_MS,
  PROMPT_ACK_TIMEOUT_MS,
  queueWhileShellRunning,
  RESTARTING_MESSAGE,
  send,
  WebRpcError,
} from "./rpc-command-dispatch";
import {
  armReap,
  bindSessionLifecycle,
  destroy,
  destroyAndWait,
  DISCONNECT_DESTROY_MS,
  handleProcessExit,
  initialize,
  noteActivity,
  reapIfDisconnected,
  resetIdleTimer,
  restart,
  start,
  waitUntilReady,
} from "./rpc-session-lifecycle";
import {
  adoptSessionName,
  autoTitle,
  bindSessionTitle,
  generateSessionTitle,
  generateTitle,
  readSessionName,
  RENAME_OUTPUT_RE,
} from "./rpc-session-title";

export { WebRpcError };
// ============================================================================
// Types
// ============================================================================

export interface AgentEvent {
  type: string;
  web: SessionStreamCursor;
  [key: string]: unknown;
}

type EventListener = (event: AgentEvent) => void;
type UnsequencedAgentEvent = { type: string; [key: string]: unknown };

interface CompactionResultLike {
  summary?: string;
  tokensBefore?: number;
  estimatedTokensAfter?: number;
  /** omp ≥17.4 reports the real post-compaction count when available. */
  tokensAfter?: number;
}

const MCP_LIST_TIMEOUT_MS = 15_000;
const NON_TERMINAL_CONTINUATION_GRACE_MS = 2_000;

// omp aliases "find"->"glob" and has no "ls" tool; the web UI presets still use
// the pi names (core/tool-presets.ts), so translate before building --tools.
const TOOL_NAME_ALIASES: Record<string, string> = { find: "glob", search: "grep" };
const DROPPED_TOOL_NAMES = new Set(["ls"]);

/** Translate pi-web preset tool names into omp builtin tool names. */
export function mapPresetToolNames(toolNames: string[]): string[] {
  const out: string[] = [];
  for (const raw of toolNames) {
    const lower = raw.toLowerCase();
    if (DROPPED_TOOL_NAMES.has(lower)) continue;
    const mapped = TOOL_NAME_ALIASES[lower] ?? lower;
    if (!out.includes(mapped)) out.push(mapped);
  }
  return out;
}

const FULL_PRESET_KEY = [...PRESET_FULL].map((n) => n.toLowerCase()).sort().join(",");

/** Extra CLI args for spawning `omp --mode rpc-ui` for a session. */
export function buildSessionSpawnArgs(sessionFile: string, toolNames?: string[], advisor = false, launchConfig?: ProjectLaunchConfig, modelOverride?: string): string[] {
  const args: string[] = [];
  if (sessionFile) {
    // An absolute path (or anything containing "/") resolves deterministically:
    // omp's createSessionManager opens it directly via SessionManager.open
    // without any interactive resume/fork prompts (main.ts resume handling).
    args.push("--resume", sessionFile);
    // An explicitly chosen model replaces the saved model and skips its
    // restore check (omp's --model at startup). Without this, resuming a
    // session whose saved model can no longer be restored dies before any
    // set_model RPC can run (#277). Args are passed as an argv array, never
    // through a shell, so only whitespace / flag-smuggled values are kept out.
    if (modelOverride && !modelOverride.startsWith("-") && !/\s/.test(modelOverride)) {
      args.push("--model", modelOverride);
    }
  } else if (toolNames !== undefined) {
    const presetKey = toolNames.map((n) => n.toLowerCase()).sort().join(",");
    if (toolNames.length === 0) {
      args.push("--no-tools");
    } else if (presetKey === FULL_PRESET_KEY) {
      // "Full" means everything: leave omp's complete default toolset intact
      // rather than restricting it to the (much smaller) pi preset list.
    } else {
      const mapped = mapPresetToolNames(toolNames);
      if (mapped.length > 0) args.push("--tools", mapped.join(","));
    }
  }
  if (advisor) args.push("--advisor");
  else if (launchConfig?.advisor) args.push("--advisor");
  // Defense in depth: the registry is hand-editable, so re-strip reserved
  // args and dash-leading profiles at the spawn boundary even though the
  // API validates them on write.
  if (launchConfig?.profile && !launchConfig.profile.startsWith("-")) args.push("--profile", launchConfig.profile);
  if (launchConfig?.extraArgs) args.push(...launchConfig.extraArgs.filter((arg) => !isReservedLaunchArg(arg)));
  return args;
}


/**
 * Pick a spawn cwd that actually exists. A session records the directory it was
 * created in, but that directory may have been deleted since: spawn() would
 * fail with ENOENT and `omp --cwd <missing>` throws in setProjectDir. omp's own
 * resume path skips the chdir when the recorded project dir is gone and keeps
 * the launch cwd (main.ts), so hand it a live directory and let it decide.
 */
export function resolveSpawnCwd(recordedCwd?: string | null): string {
  return resolveSpawnCwdResult(recordedCwd).cwd;
}

/**
 * Resolve a spawn cwd and report whether it differs from the session's recorded
 * directory. Callers that surface a UI (the SSE resume paths) use the result to
 * emit a notice so the user knows the agent is running somewhere other than the
 * directory the sidebar/header still advertises — a silent wrong-tree fallback
 * would let file tool calls edit an unexpected repo with no signal.
 */
export function resolveSpawnCwdResult(recordedCwd?: string | null): { cwd: string; fellBack: boolean } {
  if (recordedCwd && existsSync(recordedCwd)) return { cwd: recordedCwd, fellBack: false };
  try {
    const serverCwd = process.cwd();
    if (serverCwd && existsSync(serverCwd)) return { cwd: serverCwd, fellBack: true };
  } catch {
    // process.cwd() itself throws when the server's own cwd was removed.
  }
  return { cwd: homedir(), fellBack: true };
}

/** omp's CompactionResult historically omitted any post-compaction token
 * count; approximate it from the summary so the compaction banner can show
 * savings instead of "→ 0 tokens". Newer omp reports a real `tokensAfter` —
 * prefer it when present. */
function patchEstimatedTokensAfter(result: unknown): void {
  if (!result || typeof result !== "object") return;
  const compaction = result as CompactionResultLike;
  if (compaction.estimatedTokensAfter === undefined) {
    // Prefer omp ≥17.4's real post-compaction count; fall back to the
    // summary-length estimate for older builds.
    const rawTokensAfter = typeof compaction.tokensAfter === "number"
      ? Math.max(0, compaction.tokensAfter)
      : (compaction.summary?.length ?? 0) / 4;
    compaction.estimatedTokensAfter = Math.round(rawTokensAfter);
  }
}

// ============================================================================
// AgentSessionWrapper
// Wraps one spawned `omp --mode rpc-ui` process with the interface the rest of
// the app expects (same command surface pi-web's in-process wrapper offered).
// ============================================================================


interface IdentityChangeOptions {
  /** The old id still names this wrapper (session moved files, not switched). */
  keepOldId?: boolean;
}

export class AgentSessionWrapper {
  private listeners: EventListener[] = [];
  /** Server-side observers (the core authority). They never count as a UI
   *  attachment: subscribing to them must not keep the child from reaping. */
  private frameObservers = new Set<EventListener>();
  private pendingUiRequests = new Map<string, UnsequencedAgentEvent>();
  private uiExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private extensionStatuses = new Map<string, string>();
  private extensionWidgets = new Map<string, ExtensionWidgetItem>();
  private promptRunning = false;
  private promptDispatchPendingCount = 0;
  private historyMutationPendingCount = 0;
  private historyEditInFlight = false;
  private awaitingAgentStart = false;
  private awaitingAgentStartDeadline = 0;
  private continuationGraceUntil = 0;
  private bashRunning = false;
  private streaming = false;
  private compacting = false;
  private streamId = randomUUID();
  private streamSequence = 0;
  /** Positive evidence for this run, retained after native completion but before disk append. */
  private responseObserved = false;
  private responseRunActive = false;
  private fastModeEnabled = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  /** Lazily-armed deadline for tearing down a session nobody is watching. */
  private reapTimer: ReturnType<typeof setTimeout> | null = null;
  private reapDeadline = 0;
  private lastActivityAt = 0;
  /** In-flight `send()` calls: the reaper must never dispose the child out from
   * under a command that is still awaiting its response. */
  private pendingCommands = 0;
  /** The start handshake (ready + protocol negotiation + get_state) is in flight. */
  private handshaking = false;
  private readonly disconnectDestroyMs: number;
  private onDestroyCallback: (() => void) | null = null;
  private onIdentityChangeCallback: ((oldId: string, newId: string, options?: IdentityChangeOptions) => void) | null = null;
  /** omp reported a `session-persistence` notice: its next identity change is
   * the same conversation moving to a sibling file, not a session switch. */
  private sessionMovePending = false;
  private unsubscribeFrames: (() => void) | null = null;
  private readonly detectNotification = createNotificationDetector();
  /** Agent activity since the last `session_settled`: background work may still run after the turn ended. */
  private unsettled = false;
  /** Ids this conversation had before omp moved it to a new file. */
  private readonly movedFromIds: string[] = [];
  private initPromise: Promise<void> | null = null;
  private restarting = false;
  private mcpListWaiter: { resolve: (text: string) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  /** Synchronous mutex for getMcpList: checked+set before any await, so two
   *  concurrent callers can never both enter (the waiter/promptRunning
   *  bookkeeping alone is not an atomic gate). */
  private mcpListInFlight = false;
  private _alive = true;
  /** Host tools the web UI registered via set_host_tools (agent-callable). */
  private hostToolNames: Set<string> = new Set();
  /** host_tool_call ids awaiting a host_tool_result from the browser. */
  private pendingHostTools: Map<string, UnsequencedAgentEvent> = new Map();
  /** URI schemes the web UI registered via set_host_uri_schemes. */
  private hostUriSchemes: Map<string, { writable?: boolean }> = new Map();
  /** host_uri_request ids awaiting a host_uri_result from the browser. */
  private pendingHostUris: Map<string, UnsequencedAgentEvent> = new Map();
  /** Resolves once an in-flight destroyAndWait finishes; null when idle. Read
   * by startRpcSession so a replacement spawn awaits the old child's exit. */
  destroyPromise: Promise<void> | null = null;
  private _sessionId = "";
  private _sessionFile = "";
  private _sessionName: string | undefined;
  private proc: RpcProcess;
  /** Process whose exit is expected because reload is deliberately disposing it. */
  private expectedExitProc: RpcProcess | null = null;
  readonly cwd: string;
  /** The conversation state machine for this wrapper; the only live model. */
  readonly authority: SessionAuthority;
  /** Whether the child was spawned with --advisor. The flag is spawn-time
   * only (no runtime RPC toggles it), so applying a changed advisor setting
   * means replacing an idle child on the next startRpcSession call. */
  readonly advisorSpawned: boolean;
  /** The cwd recorded in the session file header; null for brand-new sessions
   * or when the header lacks one. Used to detect a spawn fallback so a notice
   * can warn the user the agent is running in a different directory. */
  private readonly recordedCwd: string | null;

  // Plain field assignments (not TS parameter properties) keep this module
  // runnable under Node's strip-only TypeScript mode for probes/tests.
  constructor(
    proc: RpcProcess,
    cwd: string,
    recordedCwd?: string | null,
    advisorSpawned = false,
    expectedSessionId = "",
    /** Test seam: the real value is DISCONNECT_DESTROY_MS (120s), far too long
     *  for a unit test. 0 disables reaping for that wrapper. */
    disconnectDestroyMs: number = DISCONNECT_DESTROY_MS,
  ) {
    this.proc = proc;
    this.cwd = cwd;
    this.recordedCwd = recordedCwd ?? null;
    this.advisorSpawned = advisorSpawned;
    this._sessionId = expectedSessionId;
    this.disconnectDestroyMs = disconnectDestroyMs;
    this.authority = new SessionAuthority(this);
    this.authority.start();
  }

  get sessionId(): string {
    return this._sessionId;
  }

  get sessionFile(): string {
    return this._sessionFile;
  }

  isAlive(): boolean {
    return this._alive && this.proc.isAlive;
  }

  isRunning(): boolean {
    // A human/host response can outlive the current streaming turn. Reaping it
    // closes stdin and OMP records "Request was aborted", even without a Stop.
    return this.isAlive() && (this.promptRunning || this.streaming || this.compacting || this.bashRunning
      || this.pendingUiRequests.size > 0 || this.pendingHostTools.size > 0 || this.pendingHostUris.size > 0);
  }

  /** Local history navigation is busy control work, not an interruptible model turn. */
  isEditingHistory(): boolean {
    return this.historyEditInFlight;
  }

  /** A web UI (SSE stream) is currently attached to this session. */
  hasSubscribers(): boolean {
    return this.listeners.length > 0;
  }

  private noteActivity(): void {
    noteActivity.call(this as never);
  }

  private armReap(): void {
    armReap.call(this as never);
  }

  private reapIfDisconnected(): void {
    reapIfDisconnected.call(this as never);
  }

  get snapshot(): Snapshot {
    return this.authority.snapshot;
  }

  subscribe(listener: (snapshot: Snapshot) => void): () => void {
    return this.authority.subscribe(listener);
  }

  dispatch(intent: ChatIntent): Promise<DispatchResult> {
    return this.authority.dispatch(intent);
  }

  refreshHistory(): Promise<void> {
    return this.authority.refreshHistory();
  }

  /** Host lifecycle flags; the conversation state lives in `snapshot`. */
  isPromptRunning(): boolean {
    return this.promptRunning;
  }

  isStreamingResponse(): boolean {
    return this.streaming;
  }

  isCompactingSession(): boolean {
    return this.compacting;
  }

  hasResponseObserved(): boolean {
    return this.responseObserved;
  }

  private clearLiveSnapshots(): void {
    this.authority.clearLive();
    this.streamSequence += 1;
  }

  private resetStream(): void {
    this.responseObserved = false;
    this.responseRunActive = false;
    this.streamId = randomUUID();
    this.streamSequence = 0;
    this.authority.resetStream(this.streamId);
  }

  start(): void {
    start.call(this as never);
  }

  waitUntilReady(): Promise<void> {
    return waitUntilReady.call(this as never);
  }

  private async initialize(): Promise<void> {
    return initialize.call(this as never);
  }

  private applyIdentity(state: RpcSessionState): void {
    const oldId = this._sessionId;
    const identityChanged = Boolean(oldId) && (state.sessionId !== oldId || (state.sessionFile && state.sessionFile !== this._sessionFile));
    // omp >= 18.5 moves a session it does not own onto a new file on its first
    // write (`session-persistence` notice). The conversation continues, so the
    // live stream and run state must survive; only the id changes.
    const moved = identityChanged && this.sessionMovePending;
    if (identityChanged && !moved) {
      this.resetStream();
      this.promptRunning = false;
      this.awaitingAgentStart = false;
      this.awaitingAgentStartDeadline = 0;
      this.continuationGraceUntil = 0;
      // A different conversation now: the old one's ids must not suppress its notifications.
      this.movedFromIds.length = 0;
    }
    this._sessionId = state.sessionId;
    this._sessionFile = state.sessionFile ?? "";
    this._sessionName = state.sessionName;
    if (oldId !== this._sessionId) this.authority.setSessionId(this._sessionId);
    this.streaming = state.isStreaming;
    this.compacting = state.isCompacting;
    this.fastModeEnabled = state.fastModeEnabled ?? state.fastMode ?? this.fastModeEnabled;
    if (this._sessionFile) cacheSessionPath(this._sessionId, this._sessionFile);
    if (moved) {
      this.sessionMovePending = false;
      if (oldId !== this._sessionId) {
        // Tabs still showing the old id are still viewing this conversation.
        this.movedFromIds.push(oldId);
        // Keep the old id routable: other tabs still address it, and a fresh
        // `--resume` of the old file would fork again (its owner lives on).
        this.onIdentityChangeCallback?.(oldId, this._sessionId, { keepOldId: true });
        this.invalidateSessionLists();
      }
    }
  }

  /** Whether omp answered `generate_title` with "Unknown command" (cached per child). */
  private generateTitleUnsupported = false;
  /** Background title requests made per session id (see autoTitle). */
  private autoTitleAttempts = new Map<string, number>();
  private autoTitleInFlight = false;
  /** Until this time, drop the chat output of a background `/rename`. */
  private quietRenameUntil = 0;

  async generateTitle({ quiet = false }: { quiet?: boolean } = {}): Promise<string | null> {
    return generateTitle.call(this as never, { quiet });
  }

  private async generateSessionTitle(quiet = false): Promise<string | null> {
    return generateSessionTitle.call(this as never, quiet);
  }

  private autoTitle(): void {
    autoTitle.call(this as never);
  }

  private async readSessionName(): Promise<string | null> {
    return readSessionName.call(this as never);
  }

  private adoptSessionName(title: string): void {
    adoptSessionName.call(this as never, title);
  }

  /** Re-read identity after omp reported that it moved this session to a new file. */
  private async followSessionMove(): Promise<void> {
    this.sessionMovePending = true;
    try {
      const state = await this.getStateWithTimeout();
      if (this._alive) this.applyIdentity(state);
    } catch {
      // The next get_state-driven refresh still applies the pending move.
    } finally {
      // A persistence warning that is not a move changes no identity; do not
      // let it mask a later genuine session switch.
      if (this.sessionMovePending && this._alive) this.sessionMovePending = false;
      notifyRunningChange({ refreshSessionList: true });
    }
  }

  handleProcessExit(
    { code, signal, stderrTail }: { code: number | null; signal: NodeJS.Signals | null; stderrTail: string },
    sourceProc: RpcProcess = this.proc,
  ): void {
    handleProcessExit.call(this as never, { code, signal, stderrTail }, sourceProc);
  }

  private publishNotifications(frame: Record<string, unknown>): void {
    const session = {
      sessionId: this._sessionId,
      sessionName: this._sessionName || this.cwd.split(/[\\/]/).filter(Boolean).pop() || null,
    };
    for (const notification of this.detectNotification(frame, session)) {
      publishNotification(this.movedFromIds.length ? { ...notification, aliases: this.movedFromIds } : notification);
    }
  }

  private handleFrame(frame: RpcFrame): void {
    // The helper has its own process listener. Its correlated control replies
    // must never become browser notices, replayed dialogs, or notifications,
    // even when they arrive after a failed/timed-out edit.
    if (isSessionEditReply(frame)) return;
    this.resetIdleTimer();
    const event = frame.type === "available_commands_update" && Array.isArray(frame.commands)
      ? { ...frame, commands: (frame.commands as RpcAvailableSlashCommand[]).filter((command) => command.name !== SESSION_EDIT_COMMAND) }
      : frame;
    let refreshSessionList = false;

    switch (event.type) {
      case "command_output": {
        // `/mcp list` is a local OMP command. Capture its authoritative text for
        // Settings instead of adding an invisible command to the chat stream.
        const waiter = this.mcpListWaiter;
        if (waiter && typeof event.text === "string") {
          clearTimeout(waiter.timer);
          this.mcpListWaiter = null;
          waiter.resolve(event.text);
          notifyRunningChange();
          return;
        }
        // The output of a background `/rename` (see autoTitle) is not chat content.
        if (Date.now() < this.quietRenameUntil && typeof event.text === "string" && RENAME_OUTPUT_RE.test(event.text)) {
          this.quietRenameUntil = 0;
          return;
        }
        break;
      }
      case "agent_start":
        this.unsettled = true;
        this.promptRunning = true;
        this.streaming = true;
        this.awaitingAgentStart = false;
        this.awaitingAgentStartDeadline = 0;
        this.continuationGraceUntil = 0;
        // The session file can appear just after the prompt acknowledgement.
        // Invalidate and signal the sidebar now rather than waiting for the
        // agent's first reply or terminal event.
        this.invalidateSessionLists();
        refreshSessionList = true;
        // If the file is not on disk yet, the sidebar refresh above may walk
        // the sessions dir before it exists — and the mtime-keyed walk cache
        // then stays stale (NTFS does not bump the sessions-root mtime for
        // files added inside a project subdirectory), hiding the running
        // session from the list until the next invalidation (agent_end).
        // Re-signal once the file actually lands.
        if (this._sessionFile && !existsSync(this._sessionFile)) {
          this.signalWhenSessionFileAppears();
        }
        break;
      case "agent_end":
        if (event.isTerminal !== false) {
          this.streaming = false;
          this.promptRunning = false;
          this.awaitingAgentStart = false;
          this.awaitingAgentStartDeadline = 0;
          this.continuationGraceUntil = 0;
          this.invalidateSessionLists();
          this.autoTitle();
        } else {
          this.continuationGraceUntil = Date.now() + NON_TERMINAL_CONTINUATION_GRACE_MS;
        }
        break;
      case "session_settled":
        this.unsettled = false;
        break;
      case "prompt_result":
        // Local-only prompt (builtin/extension slash command) — no agent run.
        this.promptRunning = false;
        this.awaitingAgentStart = false;
        this.awaitingAgentStartDeadline = 0;
        break;
      case "auto_compaction_start":
        this.compacting = true;
        break;
      case "auto_compaction_end":
        this.compacting = false;
        // Same patch the manual `compact` path applies — the client reads
        // event.result.estimatedTokensAfter for the banner.
        patchEstimatedTokensAfter(event.result);
        this.invalidateSessionLists();
        break;
      case "notice":
        if (event.source === "session-persistence") void this.followSessionMove();
        break;
      case "session_info_update":
        if (typeof event.title === "string") this._sessionName = event.title;
        this.invalidateSessionLists();
        refreshSessionList = true;
        break;
      case "skill_diagnostics_update":
        this.emit({
          type: "skill_diagnostics_update",
          data: parseSkillDiagnosticsSnapshot(event.data),
        });
        notifyRunningChange();
        return;
      case "response": {
        // Unsolicited failed responses surface async prompt failures (omp
        // reuses the original command id after the immediate ack). Some omp
        // versions omit `command` on that second response, so the active run
        // is also a terminal-failure signal. Otherwise this frame would be
        // ignored and the UI would stop with no explanation.
        if (event.success === false) {
          const promptFailure =
            event.command === "prompt" ||
            (!event.command && (this.promptRunning || this.streaming));
          const detail = typeof event.error === "string"
            ? event.error
            : typeof event.message === "string"
              ? event.message
              : "RPC command failed";
          if (!promptFailure) {
            this.emit({ type: "error", error: event.error, message: detail, command: event.command });
            notifyRunningChange();
            return;
          }
          this.promptRunning = false;
          this.awaitingAgentStart = false;
          this.awaitingAgentStartDeadline = 0;
          const promptError = { type: "prompt_error", errorMessage: detail, error: event.error, command: event.command };
          this.publishNotifications(promptError);
          this.emit(promptError);
          notifyRunningChange();
          return;
        }
        break;
      }
      case "extension_ui_request": {
        if (this.trackExtensionUiRequest(event)) {
          notifyRunningChange();
          return;
        }
        break;
      }
      case "host_tool_call": {
        const id = typeof event.id === "string" ? event.id : "";
        const toolName = typeof event.toolName === "string" ? event.toolName : "";
        // Server-side agent tools (#275) are answered here, before any
        // browser routing, so they work with no tab open. A disabled gate
        // is an explicit error, not a silent hang and not a browser call.
        if (id && toolName && AGENT_TOOL_NAMES.has(toolName)) {
          if (loadWebServerSettings().agentToolsEnabled) {
            void this.answerServerAgentTool(event);
          } else {
            this.proc.sendFrame({
              type: "host_tool_result",
              id,
              isError: true,
              result: {
                content: [{
                  type: "text",
                  text: "Agent tools are disabled. Enable \"Agent tools\" in omp-web Settings (System & Updates) first.",
                }],
              },
            });
            this.emit({ type: "notice", level: "warning", message: `Rejected disabled agent tool: ${toolName}` });
          }
          return;
        }
        // Route REGISTERED host tools to an attached UI (the browser answers
        // via host_tool_result). With no tab on this session, hand the call to
        // any open omp-web tab (the user switched sessions mid-run). Otherwise
        // reject immediately so the agent never hangs on a tool nobody will
        // answer.
        if (id && toolName && this.hostToolNames.has(toolName)) {
          if (this.listeners.length > 0) {
            this.pendingHostTools.set(id, event);
            this.emit(event);
            notifyRunningChange();
            return;
          }
          const otherTabs = getHostToolListeners();
          if (otherTabs.size > 0) {
            this.pendingHostTools.set(id, { ...event, webCrossSession: true });
            const args = event.arguments && typeof event.arguments === "object" ? event.arguments as Record<string, unknown> : {};
            const call: CrossSessionHostToolCall = { sessionId: this.sessionId, id, toolName, arguments: args };
            for (const listener of otherTabs) {
              try { listener(call); } catch { /* ignore listener errors */ }
            }
            notifyRunningChange();
            return;
          }
        }
        // Unregistered tool / no listener: reject (emits a notice) and do NOT
        // re-emit the frame — the UI must not answer a call nobody routed.
        this.rejectUnexpectedHostTool(event);
        return;
      }
      case "host_tool_cancel": {
        const targetId = typeof event.targetId === "string" ? event.targetId : "";
        if (targetId && this.pendingHostTools.delete(targetId)) {
          this.emit(event);
          notifyRunningChange();
          return;
        }
        break;
      }
      case "host_uri_request": {
        const id = typeof event.id === "string" ? event.id : "";
        const url = typeof event.url === "string" ? event.url : "";
        // Route registered schemes to an attached UI (the browser answers via
        // host_uri_result); unknown schemes / no listener are rejected so the
        // agent's read/write never hangs.
        const scheme = url.split(":")[0] ?? "";
        const operation = event.operation === "write" ? "write" : "read";
        const registered = this.hostUriSchemes.get(scheme);
        if (id && scheme && registered && (operation !== "write" || registered.writable) && this.listeners.length > 0) {
          this.pendingHostUris.set(id, event);
          this.emit(event);
          notifyRunningChange();
          return;
        }
        this.proc.sendFrame({
          type: "host_uri_result",
          id,
          isError: true,
          error: `URI scheme \"${scheme}\" is not registered by omp-web`,
        });
        return;
      }
      case "host_uri_cancel": {
        const targetId = typeof event.targetId === "string" ? event.targetId : "";
        if (targetId && this.pendingHostUris.delete(targetId)) {
          this.emit(event);
          notifyRunningChange();
          return;
        }
        break;
      }
    }

    this.publishNotifications(event);
    this.emit(event);
    notifyRunningChange({ refreshSessionList });
  }

  /** Forget a pending dialog and its expiry timer. */
  private forgetPendingUiRequest(id: string): void {
    this.pendingUiRequests.delete(id);
    const timer = this.uiExpiryTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.uiExpiryTimers.delete(id);
    }
  }

  private clearPendingUiRequests(): void {
    for (const timer of this.uiExpiryTimers.values()) clearTimeout(timer);
    this.uiExpiryTimers.clear();
    this.pendingUiRequests.clear();
  }

  private trackExtensionUiRequest(event: UnsequencedAgentEvent): boolean {
    const method = event.method as string;
    const id = event.id as string;
    if (method === "cancel") {
      this.forgetPendingUiRequest(event.targetId as string);
      return false;
    }
    // Only the “Allow tool: <name>” confirmation is covered. Other extension
    // prompts, including login/editor confirmations, remain interactive.
    let autoApproveExtension = false;
    try {
      autoApproveExtension = readNativeSettings().settings.tools?.approval?.extension === "allow";
    } catch {
      // A malformed config must not prevent normal interactive approval.
    }
    if (method === "confirm" && typeof event.title === "string" && /^allow tool\s*:/i.test(event.title) && autoApproveExtension) {
      this.forgetPendingUiRequest(id);
      this.proc.sendFrame({ type: "extension_ui_response", id, confirmed: true });
      return true;
    }
    // Blocking dialogs stay pending until the client answers (replayed to
    // newly-attached SSE listeners so dialogs survive reconnects).
    if (Object.hasOwn(BLOCKING_UI_METHODS, method)) {
      this.forgetPendingUiRequest(id);
      const timeout = typeof event.timeout === "number" ? event.timeout : undefined;
      if (timeout && timeout > 0) {
        event.expiresAt = Date.now() + timeout;
        const timer = setTimeout(() => this.forgetPendingUiRequest(id), timeout);
        timer.unref?.();
        this.uiExpiryTimers.set(id, timer);
      }
      this.pendingUiRequests.set(id, event);
      return false;
    }
    if (method === "setStatus") {
      const key = event.statusKey as string;
      const text = event.statusText as string | undefined;
      if (text === undefined) this.extensionStatuses.delete(key);
      else this.extensionStatuses.set(key, text);
      return false;
    }
    if (method === "setWidget") {
      const key = event.widgetKey as string;
      const lines = event.widgetLines as string[] | undefined;
      if (lines === undefined) {
        this.extensionWidgets.delete(key);
      } else {
        this.extensionWidgets.set(key, {
          key,
          lines,
          placement: (event.widgetPlacement as "aboveEditor" | "belowEditor" | undefined) ?? "aboveEditor",
        });
      }
    }
    return false;
  }

  /**
   * Settle a host_tool_call the UI did not register (or arrived with no
   * attached listener) with an explicit error so its agent turn cannot hang
   * forever waiting for a response. Registered host tools are routed to
   * listeners in handleFrame (see the host_tool_call case).
   */
  private rejectUnexpectedHostTool(event: UnsequencedAgentEvent): void {
    const id = typeof event.id === "string" ? event.id : "";
    if (!id) return;
    const toolName = typeof event.toolName === "string" ? event.toolName : "unknown";
    this.proc.sendFrame({
      type: "host_tool_result",
      id,
      isError: true,
      result: {
        content: [{
          type: "text",
          text: `Host tool \"${toolName}\" is not available in omp-web. Use OMP's built-in tools within the selected workspace.`,
        }],
      },
    });
    this.emit({ type: "notice", level: "warning", message: `Rejected unavailable host tool: ${toolName}` });
  }

  /**
   * Reject outstanding host tool calls (browser disconnected / destroy): "own" ones went to this session's
   * stream, "cross" ones to other open tabs (see subscribeHostToolCalls).
   */
  private rejectPendingHostTools(message: string, which: "all" | "own" | "cross" = "all"): void {
    for (const [id, event] of this.pendingHostTools) {
      const cross = event.webCrossSession === true;
      if ((which === "own" && cross) || (which === "cross" && !cross)) continue;
      this.pendingHostTools.delete(id);
      this.proc.sendFrame({
        type: "host_tool_result",
        id,
        isError: true,
        result: { content: [{ type: "text", text: message }] },
      });
    }
  }

  /** The last other tab left: settle calls routed to other tabs. */
  rejectCrossSessionHostTools(): void {
    this.rejectPendingHostTools("The web UI disconnected while the agent was waiting for this host tool", "cross");
  }

  /** Reject every outstanding host URI request (browser disconnected / destroy). */
  private rejectPendingHostUris(message: string): void {
    for (const id of this.pendingHostUris.keys()) {
      this.proc.sendFrame({
        type: "host_uri_result",
        id,
        isError: true,
        error: message,
      });
    }
    this.pendingHostUris.clear();
  }

  private emit(nativeEvent: UnsequencedAgentEvent): void {
    // Tool-result images go out (and into the replay snapshot) as media URLs:
    // big screenshots must never sit in the browser's chat state as base64.
    const event = eventWithToolResultImageUrls(nativeEvent);
    // `web` belongs to this wrapper, never to native/extension-supplied frames.
    // Strip it before caching tool snapshots as well as before wire emission.
    delete event.web;
    switch (event.type) {
      case "agent_start":
        this.responseObserved = false;
        this.responseRunActive = true;
        this.clearLiveSnapshots();
        break;
      case "agent_end":
        if (event.isTerminal === false) break;
        this.responseRunActive = false;
        this.streaming = false;
        this.promptRunning = false;
        this.compacting = false;
        this.clearLiveSnapshots();
        break;
      case "prompt_error":
      case "prompt_result":
        this.responseRunActive = false;
        this.streaming = false;
        this.compacting = false;
        this.promptRunning = false;
        this.clearLiveSnapshots();
        break;
      case "message_start":
      case "message_update":
      case "message_end": {
        const message = event.message as Partial<AgentMessage> | undefined;
        if (this.responseRunActive && hasVisibleAssistantContent(message)) this.responseObserved = true;
        break;
      }
    }
    event.web = { streamId: this.streamId, sequence: ++this.streamSequence };
    // The server authority observes the frame before UI fanout, so a listener
    // always sees a snapshot that includes the event it was handed.
    for (const l of this.frameObservers) {
      try {
        l(event as AgentEvent);
      } catch {
        // An internal observer must never break the frame fanout.
      }
    }
    for (const l of this.listeners) {
      try {
        l(event as AgentEvent);
      } catch {
        // A throwing subscriber (SSE encode failure, UI handler bug) must not
        // starve the remaining subscribers — same isolation RpcProcess and
        // notifyRunningChange apply to their listener sets.
      }
    }
  }

  private sessionFileSignalTimer: NodeJS.Timeout | null = null;

  /** Invalidate session-list metadata plus ONLY this session's parse caches
   * when the file path is known, else fall back to the full invalidation.
   * Use this on the hot event paths (agent_end, auto_compaction_end,
   * session_info_update, …) so a busy session does not flush every other
   * open session's parsed-entry cache. List metadata (sidebar order/counts)
   * still always refreshes. */
  private invalidateSessionLists(): void {
    if (this._sessionFile) {
      invalidateSessionListMeta();
      invalidateSessionEntriesCache(this._sessionFile);
    } else {
      invalidateSessionListCache();
    }
  }

  /** Poll briefly for the session file to appear after agent_start, then
   *  invalidate the session-list caches and re-signal the sidebar so the
   *  running session shows up even though the file landed after the first
   *  refresh (see the agent_start case). Bounded (max ~10s) and stops on
   *  destroy. */
  private signalWhenSessionFileAppears(): void {
    if (this.sessionFileSignalTimer) return;
    let attempts = 0;
    const check = () => {
      this.sessionFileSignalTimer = null;
      if (!this._alive || !this._sessionFile) return;
      if (!existsSync(this._sessionFile)) {
        attempts += 1;
        if (attempts < 40) {
          this.sessionFileSignalTimer = setTimeout(check, 250);
        }
        return;
      }
      this.invalidateSessionLists();
      notifyRunningChange({ refreshSessionList: true });
    };
    this.sessionFileSignalTimer = setTimeout(check, 250);
  }
  private lastIdleReset = 0;
  private resetIdleTimer(force = false): void {
    resetIdleTimer.call(this as never, force);
  }

  onEvent(listener: EventListener): () => void {
    this.listeners.push(listener);
    this.noteActivity();
    const now = Date.now();
    for (const [id, event] of this.pendingUiRequests) {
      const expiresAt = event.expiresAt as number | undefined;
      if (expiresAt !== undefined && expiresAt <= now) {
        this.forgetPendingUiRequest(id);
        continue;
      }
      listener({ ...event, web: { streamId: this.streamId, sequence: ++this.streamSequence } });
    }
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i !== -1) this.listeners.splice(i, 1);
      // No UI attached anymore: reject outstanding host tool calls so the
      // agent never waits forever on a tool nobody will answer.
      if (this.listeners.length === 0) {
        this.rejectPendingHostTools("The web UI disconnected while the agent was waiting for this host tool", "own");
        this.rejectPendingHostUris("The web UI disconnected while the agent was waiting for this URI request");
        // The last tab left. Start (not extend) the reap clock, so a session
        // that was never watched at all — predict_word, /api/agent/new — is
        // cleaned up on the same schedule as one whose tab just closed.
        this.reapDeadline = Date.now() + this.disconnectDestroyMs;
        this.armReap();
      }
    };
  }

  onDestroy(cb: () => void): void {
    this.onDestroyCallback = cb;
  }

  /** Observe every live frame without registering as a UI attachment. */
  onFrame(listener: EventListener): () => void {
    this.frameObservers.add(listener);
    return () => {
      this.frameObservers.delete(listener);
    };
  }

  /**
   * Wait for the next `terminalEndsNeeded` terminal turn ends after this
   * call (terminal agent_end, prompt_result, or prompt_error). The caller
   * registers the waiter BEFORE sending the prompt/steer/follow_up, so a
   * fast turn cannot end before the waiter exists. Rejects on timeout;
   * the target is left running (never aborted by a waiter timeout).
   * A follow_up sent to a running target needs two ends: the running
   * turn ends first, then the queued message's own turn ends.
   */
  waitForTurnEnd(timeoutMs: number, terminalEndsNeeded = 1): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let done = false;
      let endsSeen = 0;
      const timer = setTimeout(() => finish(new Error("Timed out waiting for the target session's response.")), timeoutMs);
      timer.unref?.();
      const detach = this.onEvent((event) => {
        if (event.type === "agent_end" && event.isTerminal === false) return;
        if (event.type === "agent_end" || event.type === "prompt_result") {
          endsSeen += 1;
          if (endsSeen >= terminalEndsNeeded) finish(null);
        } else if (event.type === "prompt_error") {
          finish(new Error(typeof event.errorMessage === "string" ? event.errorMessage : "Target session turn failed."));
        }
      });
      const finish = (error: Error | null) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        detach();
        if (error) reject(error);
        else resolve();
      };
    });
  }

  /**
   * Answer a server-side agent tool call (#275) from this wrapper's child.
   * Runs on the server, with no browser involved, and answers directly
   * with host_tool_result — never via pendingHostTools, so a later tab
   * disconnect cannot settle it as a UI call.
   */
  private async answerServerAgentTool(event: UnsequencedAgentEvent): Promise<void> {
    const id = typeof event.id === "string" ? event.id : "";
    const toolName = typeof event.toolName === "string" ? event.toolName : "";
    if (!id) return;
    const sendResult = (text: string, isError = false) => {
      this.proc.sendFrame({
        type: "host_tool_result",
        id,
        isError,
        result: { content: [{ type: "text", text }] },
      });
    };
    try {
      const args = event.arguments && typeof event.arguments === "object" ? event.arguments as Record<string, unknown> : {};
      const result = await executeAgentTool(toolName, args, createAgentToolOps(), {
        sourceSessionId: this.sessionId,
        sourceCwd: this.cwd,
        enabled: loadWebServerSettings().agentToolsEnabled,
        guard: getAgentToolGuard(),
      });
      sendResult(typeof result === "string" ? result : JSON.stringify(result));
    } catch (error) {
      sendResult(error instanceof Error ? error.message : String(error), true);
    }
  }

  /** Called when a session-changing command re-keyed this wrapper (branch/new_session/switch_session). */
  onIdentityChange(cb: (oldId: string, newId: string, options?: IdentityChangeOptions) => void): void {
    this.onIdentityChangeCallback = cb;
  }

  private async withFinalRunningNotification<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } finally {
      notifyRunningChange();
    }
  }

  /** Get OMP's own complete MCP inventory and live connection states. */
  async getMcpList(): Promise<string> {
    return this.runMcpCommand("list");
  }

  /** RPC /mcp reload refreshes command metadata only. Reboot the idle child
   * against its saved session to actually rediscover MCP tools. */
  async changeMcp(action: "enable" | "disable" | "reload", name?: string): Promise<void> {
    if (!["enable", "disable", "reload"].includes(action)) throw new Error("Invalid MCP action");
    if (action !== "reload" && (!name || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name))) throw new Error("Invalid MCP server name");
    await this.runMcpCommand(action, name, true);
  }

  private async runMcpCommand(action: "list" | "enable" | "disable" | "reload", name?: string, apply = false): Promise<string> {
    if (this.restarting) throw new WebRpcError(RESTARTING_MESSAGE, "session_restarting");
    if (!this.isAlive()) throw new Error("Session is no longer running");
    if (this.isRunning() || this.historyEditInFlight || this.pendingUiRequests.size > 0 || this.pendingHostTools.size > 0 || this.pendingHostUris.size > 0) throw new WebRpcError("Wait for the current operation to finish", "session_busy");
    if (this.mcpListWaiter || this.mcpListInFlight) throw new WebRpcError("MCP list is already loading", "mcp_list_loading");

    // Dedicated synchronous mutex: promptRunning alone is not atomic — two
    // concurrent callers could both pass the isRunning() check, and the second
    // would steal the waiter so the first hangs to timeout (or receives the
    // other's output). This flag is checked+set before any await.
    this.mcpListInFlight = true;
    this.historyMutationPendingCount += 1;

    this.promptRunning = true;
    notifyRunningChange();
    let resolveOutput!: (text: string) => void;
    let rejectOutput!: (error: Error) => void;
    const output = new Promise<string>((resolve, reject) => {
      resolveOutput = resolve;
      rejectOutput = reject;
    });
    // The timeout, destroy, and sendCommand-failure paths all reject this
    // promise while the only `await output` (success path) may never run —
    // swallow the orphan so it cannot surface as an unhandledRejection.
    void output.catch(() => {});
    const waiter = {
      resolve: resolveOutput,
      reject: rejectOutput,
      timer: undefined as unknown as ReturnType<typeof setTimeout>,
    };
    waiter.timer = setTimeout(() => {
        if (this.mcpListWaiter !== waiter) return;
        this.mcpListWaiter = null;
        rejectOutput(new WebRpcError("Timed out while loading MCP servers", "mcp_list_timeout"));
      }, MCP_LIST_TIMEOUT_MS);
    // Don't pin the event loop if the caller never awaits (route aborted): the
    // pending-UI timers already unref, this one should too.
    waiter.timer.unref?.();
    this.mcpListWaiter = waiter;

    try {
      // Bounded like the prompt ack: a child that accepts the frame but never
      // acks it would otherwise suspend this call forever — the `finally` below
      // would never run and the wrapper would keep reporting itself as busy
      // (later calls fail with session_busy) until unrelated traffic cleared
      // the wedge. The 15s output wait above stays a separate concern.
      await this.proc.sendCommand({ type: "prompt", message: action === "list" ? "/mcp list" : `/mcp ${action}${name ? ` ${name}` : ""}` }, PROMPT_ACK_TIMEOUT_MS);
      const result = await output;
      if (action !== "list" && /^(?:Failed|Usage:|Server .* not found|Unknown)/m.test(result)) {
        throw new WebRpcError("OMP could not update this MCP server. Check its source configuration.", "mcp_change_failed");
      }
      if (apply) {
        try { await this.restart(); }
        catch { throw new WebRpcError("MCP configuration was saved, but session reload failed. Reopen the session to apply it.", "mcp_reload_failed"); }
      }
      return result;
    } catch (error) {
      const expired = error instanceof RpcCommandTimeoutError;
      if (this.mcpListWaiter === waiter) {
        clearTimeout(waiter.timer);
        this.mcpListWaiter = null;
        waiter.reject(
          expired
            ? new WebRpcError("The OMP session stopped responding and was reset.", "session_unresponsive")
            : error instanceof Error
              ? error
              : new Error(String(error)),
        );
      }
      if (expired) {
        // Nothing on this child will ever resolve the waiter; recycle it like
        // the prompt-ack timeout path so the next request gets a fresh child.
        await this.destroyAndWait();
        throw new WebRpcError("The OMP session stopped responding and was reset.", "session_unresponsive");
      }
      throw error;
    } finally {
      if (this.mcpListWaiter === waiter) {
        clearTimeout(waiter.timer);
        this.mcpListWaiter = null;
      }
      this.mcpListInFlight = false;
      this.historyMutationPendingCount -= 1;
      this.promptRunning = false;
      notifyRunningChange();
    }
  }
  private buildWebState(state: RpcSessionState): WebSessionState {
    const wasRunning = this.isRunning();

    // Reconcile process-side flags with authoritative child state.
    this.applyIdentity({ ...state, sessionFile: state.sessionFile ?? this._sessionFile });
    this.streamSequence += 1;

    const awaitingExpired = !this.awaitingAgentStart || Date.now() >= this.awaitingAgentStartDeadline;
    const hasPendingWork =
      this.promptDispatchPendingCount > 0 ||
      this.historyEditInFlight ||
      (this.awaitingAgentStart && !awaitingExpired) ||
      this.mcpListWaiter !== null ||
      this.pendingUiRequests.size > 0 ||
      this.pendingHostTools.size > 0 ||
      this.pendingHostUris.size > 0;

    if (
      state.isStreaming === false &&
      state.isCompacting === false &&
      !hasPendingWork &&
      Date.now() >= this.continuationGraceUntil
    ) {
      this.promptRunning = false;
      this.awaitingAgentStart = false;
      this.awaitingAgentStartDeadline = 0;
      this.clearLiveSnapshots();
    }

    if (wasRunning && !this.isRunning()) {
      notifyRunningChange();
    }
    const skillDiagnostics = parseSkillDiagnosticsSnapshot(state.skillDiagnostics);
    return {
      sessionId: state.sessionId,
      sessionFile: state.sessionFile ?? "",
      sessionName: state.sessionName,
      isStreaming: state.isStreaming,
      isPromptRunning: this.promptRunning,
      isBashRunning: this.bashRunning,
      responseObserved: this.responseObserved,
      isCompacting: state.isCompacting,
      autoCompactionEnabled: state.autoCompactionEnabled,
      autoRetryEnabled: state.autoRetryEnabled,
      interruptMode: state.interruptMode,
      steeringMode: state.steeringMode,
      followUpMode: state.followUpMode,
      model: state.model
        ? {
            id: state.model.id,
            provider: state.model.provider,
            name: state.model.name,
            reasoning: state.model.reasoning,
            thinking: state.model.thinking ? { efforts: state.model.thinking.efforts } : undefined,
          }
        : undefined,
      messageCount: state.messageCount,
      queuedMessageCount: state.queuedMessageCount,
      queuedMessages: state.queuedMessages ?? { steering: [], followUp: [] },
      tokensPerSecond: state.tokensPerSecond ?? null,
      contextUsage: state.contextUsage ?? null,
      systemPrompt: state.systemPrompt?.join("\n\n") ?? "",
      thinkingLevel: state.thinkingLevel ?? "off",
      // The child's per-family tier map is authoritative: it changes when the
      // model switches families (isFastModeEnabled is family-scoped) or when
      // the runtime auto-disables priority (e.g. after an Anthropic reject).
      // The wrapper's own flag is only the spawn-time cache.
      fastModeEnabled: state.fastModeEnabled ?? state.fastMode ?? this.fastModeEnabled,
      fastModeActive: state.fastModeActive,
      slowModeSupported: state.slowModeSupported ?? false,
      slowModeEnabled: state.slowModeEnabled ?? false,
      slowModeScope: state.slowModeScope,
      usageLimit: state.usageLimit,
      ...(skillDiagnostics ? { skillDiagnostics } : {}),
      todoPhases: state.todoPhases ?? [],
      extensionStatuses: Array.from(this.extensionStatuses, ([key, text]) => ({ key, text })),
      extensionWidgets: Array.from(this.extensionWidgets.values()),
    };
  }

  private requireSkillDiagnostics(value: unknown): SkillDiagnosticsSnapshot {
    const snapshot = parseSkillDiagnosticsSnapshot(value);
    if (!snapshot) {
      throw new WebRpcError(
        "Skill diagnostics are unavailable for this OMP session",
        "skill_diagnostics_unsupported",
      );
    }
    return snapshot;
  }

  private async getStateWithTimeout(): Promise<RpcSessionState> {
    return this.proc.sendCommand<RpcSessionState>({ type: "get_state" }, GET_STATE_TIMEOUT_MS);
  }

  /** After branch/new_session/switch_session the child is on a different
   * session file — re-read identity and re-register in the registry. */
  private async refreshIdentityAfterSessionChange(): Promise<string> {
    const oldId = this._sessionId;
    const state = await this.getStateWithTimeout();
    this.applyIdentity(state);
    if (oldId && oldId !== this._sessionId) {
      this.onIdentityChangeCallback?.(oldId, this._sessionId);
    }
    this.invalidateSessionLists();
    return this._sessionId;
  }

  private async editMessage(entryId: unknown): Promise<SessionEditResult> {
    if (typeof entryId !== "string" || !entryId.trim()) {
      throw new WebRpcError("The edit target must be a user message", "invalid_edit_target");
    }
    if (this.isRunning() || this.historyMutationPendingCount > 1) {
      throw new WebRpcError("Wait for the current operation to finish before editing", "session_busy");
    }

    // Set synchronously, before the first native query: a second tab must not
    // send a prompt, fork, or switch the process during either preflight await.
    this.historyEditInFlight = true;
    const proc = this.proc;
    const sessionId = this._sessionId;
    const sessionFile = this._sessionFile;
    let persistenceError: Error | null = null;
    // Keep observing through the authoritative post-edit state query as well
    // as the helper's reply/ack exchange. The ordinary notice path still emits
    // the native error to every observer.
    const unsubscribe = proc.onFrame((frame) => {
      if (frame.type === "notice" && frame.source === "session-persistence" && frame.level === "error") {
        persistenceError ??= new Error(typeof frame.message === "string" ? frame.message : "OMP could not persist the history edit");
      }
    });
    notifyRunningChange();
    try {
      const before = await this.getStateWithTimeout();
      if (persistenceError) throw persistenceError;
      if (before.sessionId !== sessionId || before.sessionFile !== sessionFile
        || this._sessionId !== sessionId || this._sessionFile !== sessionFile) {
        throw new WebRpcError("The session changed before the history edit", "session_changed");
      }
      if (typeof before.isSettled !== "boolean") {
        throw new WebRpcError("Editing history requires a newer OMP that reports full session settlement", "session_edit_unsupported");
      }
      if (!before.isSettled || before.hasPendingAsyncWork === true
        || before.isStreaming || before.isCompacting || before.queuedMessageCount > 0
        || this.promptRunning || this.streaming || this.compacting || this.bashRunning) {
        throw new WebRpcError("Wait for the current run to finish before editing", "session_busy");
      }

      const result = await editSessionHistory(proc, entryId, sessionId);
      const after = await this.getStateWithTimeout();
      if (persistenceError) throw persistenceError;
      const unchanged = after.sessionId === sessionId && after.sessionFile === sessionFile;
      // Only applyIdentity's native move path can retain the originating id.
      // A reply naming a different conversation is never sufficient evidence.
      const moved = this.movedFromIds.includes(sessionId) && after.sessionId !== sessionId;
      if (!this.isAlive() || this.proc !== proc || result.sessionId !== after.sessionId
        || (!unchanged && !moved) || this._sessionId !== after.sessionId || this._sessionFile !== after.sessionFile) {
        throw new WebRpcError("The session changed during the history edit", "session_changed");
      }
      if (result.cancelled) return result;

      this.clearLiveSnapshots();
      this.responseObserved = false;
      this.responseRunActive = false;
      this.awaitingAgentStart = false;
      this.awaitingAgentStartDeadline = 0;
      this.continuationGraceUntil = 0;
      // Invalidate the confirmed edited conversation, not its preserved source.
      this.invalidateSessionLists();
      this.emit({ type: "session_history_changed", leafId: result.leafId });
      notifyRunningChange({ refreshSessionList: true });
      return result;
    } catch (error) {
      if (error instanceof RpcCommandTimeoutError) {
        // A timed-out navigation may still be running in a hook. Do not let a
        // later mutation race it once the web-side fence is released.
        await this.destroyAndWait();
        if (persistenceError) throw persistenceError;
        throw new WebRpcError("The OMP session stopped responding and was reset.", "session_unresponsive");
      }
      if (error instanceof SessionEditAgentInvocationError && !error.agentStarted) {
        // Native /retry can acknowledge before its deferred agent_start. There
        // is no observed run to own that gap: stop it before releasing Edit.
        await this.destroyAndWait();
      }
      throw persistenceError ?? error;
    } finally {
      unsubscribe();
      this.historyEditInFlight = false;
      notifyRunningChange();
    }
  }

  private async restart(): Promise<void> {
    return restart.call(this as never);
  }

  async send(command: Record<string, unknown>): Promise<unknown> {
    return send.call(this as never, command);
  }

  private async dispatchCommand(command: Record<string, unknown>): Promise<unknown> {
    return dispatchCommand.call(this as never, command);
  }

  private async queueWhileShellRunning(command: Record<string, unknown>): Promise<unknown> {
    return queueWhileShellRunning.call(this as never, command);
  }

  destroy(reason = "unspecified"): void {
    destroy.call(this as never, reason);
  }

  async destroyAndWait(reason = "unspecified"): Promise<void> {
    return destroyAndWait.call(this as never, reason);
  }
}

// ============================================================================
// Session registry
// ============================================================================
export interface RunningRpcSession {
  id: string;
  cwd: string;
}

export interface RunningSessionUpdate {
  ids: string[];
  runningSessions: RunningRpcSession[];
  exitedSessions: ExitedRpcSession[];
  refreshSessionList: boolean;
}


declare global {
  var __ompSessions: Map<string, AgentSessionWrapper> | undefined;
  var __ompStartLocks: Map<string, Promise<{ session: AgentSessionWrapper; realSessionId: string }>> | undefined;
  var __ompRunningListeners: Set<(update: RunningSessionUpdate) => void> | undefined;
  var __ompHostToolListeners: Set<(call: CrossSessionHostToolCall) => void> | undefined;
  var __ompExitedSessions: Map<string, ExitedRpcSession> | undefined;
}

function getExitedMap(): Map<string, ExitedRpcSession> {
  if (!globalThis.__ompExitedSessions) globalThis.__ompExitedSessions = new Map();
  return globalThis.__ompExitedSessions;
}

export function getExitedRpcSessions(): ExitedRpcSession[] {
  return [...getExitedMap().values()];
}

export function getExitedRpcSession(sessionId: string): ExitedRpcSession | undefined {
  return getExitedMap().get(sessionId);
}

/** Clear the visible crash state once a replacement child is ready. */
export function clearExitedRpcSession(sessionId: string): boolean {
  const cleared = getExitedMap().delete(sessionId);
  if (cleared) notifyRunningChange();
  return cleared;
}

function getRegistry(): Map<string, AgentSessionWrapper> {
  if (!globalThis.__ompSessions) {
    globalThis.__ompSessions = new Map();
    const cleanup = () => {
      // Children dying from here on are the shutdown, not finished runs.
      markShuttingDown();
      globalThis.__ompSessions?.forEach((s) => s.destroy());
    };
    process.once("exit", cleanup);
    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
  }
  return globalThis.__ompSessions;
}

function getLocks(): Map<string, Promise<{ session: AgentSessionWrapper; realSessionId: string }>> {
  if (!globalThis.__ompStartLocks) globalThis.__ompStartLocks = new Map();
  return globalThis.__ompStartLocks;
}

export function getRpcSession(sessionId: string): AgentSessionWrapper | undefined {
  return getRegistry().get(sessionId);
}

export function getRunningRpcSessions(): RunningRpcSession[] {
  const map = new Map<string, string>();
  for (const [sessionId, session] of getRegistry()) {
    if (session.isRunning()) {
      const realId = session.sessionId || sessionId;
      map.set(realId, session.cwd);
    }
  }
  return [...map.entries()].map(([id, cwd]) => ({ id, cwd }));
}

export function getRunningRpcSessionIds(): string[] {
  return getRunningRpcSessions().map((s) => s.id);
}

/** Stop all live omp children after an explicit runtime update. The browser will
 * reconnect sessions on demand and start them with the updated executable. */
export async function restartAllRpcSessions(): Promise<number> {
  const sessions = [...new Set(getRegistry().values())];
  await Promise.all(sessions.map((session) => session.destroyAndWait()));
  return sessions.length;
}

// ----------------------------------------------------------------------------
// Running-status broadcaster
//
// Pushes the current set of running session ids to subscribers whenever any
// session's running state may have changed. This lets the sidebar receive live
// updates over SSE instead of polling. Listeners live on globalThis so they
// survive Next.js hot-reload.
// ----------------------------------------------------------------------------

function getRunningListeners(): Set<(update: RunningSessionUpdate) => void> {
  if (!globalThis.__ompRunningListeners) globalThis.__ompRunningListeners = new Set();
  return globalThis.__ompRunningListeners;
}

/** Subscribe to running-session-id changes and session-list refreshes. */
export function subscribeRunningSessions(listener: (update: RunningSessionUpdate) => void): () => void {
  const listeners = getRunningListeners();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// ----------------------------------------------------------------------------
// Cross-session host tool calls
//
// A registered host tool called while no tab watches its session goes to every
// open omp-web tab (over the `host-tools` event-stream channel) instead of being rejected.
// ----------------------------------------------------------------------------

function getHostToolListeners(): Set<(call: CrossSessionHostToolCall) => void> {
  if (!globalThis.__ompHostToolListeners) globalThis.__ompHostToolListeners = new Set();
  return globalThis.__ompHostToolListeners;
}

/** Subscribe to host tool calls for sessions no tab is currently watching. */
export function subscribeHostToolCalls(listener: (call: CrossSessionHostToolCall) => void): () => void {
  const listeners = getHostToolListeners();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      for (const session of getRegistry().values()) session.rejectCrossSessionHostTools();
    }
  };
}

// Starts at the empty state so an idle server never broadcasts "nothing changed".
let lastRunningSnapshot = "[[],[]]";

/**
 * Recompute the running-session-id set and, when it changes, broadcast it.
 * A session file may first appear after its id starts running, so callers can
 * force one otherwise-identical update to refresh sidebar session metadata.
 */
export function notifyRunningChange({ refreshSessionList = false }: { refreshSessionList?: boolean } = {}): void {
  const runningSessions = getRunningRpcSessions();
  const exitedSessions = getExitedRpcSessions();
  const ids = runningSessions.map((s) => s.id);
  const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
  const snapshot = JSON.stringify([runningSessions.slice().sort(byId), exitedSessions.slice().sort(byId)]);
  if (snapshot === lastRunningSnapshot && !refreshSessionList) return;
  lastRunningSnapshot = snapshot;
  syncInterruptibleSessions();
  const update: RunningSessionUpdate = { ids, runningSessions, exitedSessions, refreshSessionList };
  for (const listener of getRunningListeners()) {
    try { listener(update); } catch { /* ignore listener errors */ }
  }
}

/** Record which sessions are mid-run, for resume after a restart. */
export function syncInterruptibleSessions(): void {
  const registry = getRegistry();
  const running = new Map<string, { id: string; advisor: boolean }>();
  for (const session of registry.values()) {
    if (session.sessionId && session.isRunning()) running.set(session.sessionId, { id: session.sessionId, advisor: session.advisorSpawned });
  }
  recordRunningSessions([...running.values()], (id) => registry.get(id)?.isAlive() === true);
}

/**
 * Restart the sessions that were mid-run when omp-web last stopped and ask
 * each to continue. Only runs when the auto-resume setting is on.
 */
export async function resumeInterruptedSessions(): Promise<void> {
  await Promise.all(takeInterruptedSessions().map(async ({ id, advisor }) => {
    try {
      const filePath = await resolveSessionPath(id);
      if (!filePath) return;
      const header = readSessionHeader(filePath);
      const { cwd } = resolveSpawnCwdResult(header?.cwd);
      const { session } = await startRpcSession(id, filePath, cwd, undefined, advisor, header?.cwd);
      await session.send({ type: "prompt", message: RESUME_PROMPT });
      console.log(`[omp-web] resumed interrupted session ${id}`);
    } catch (error) {
      console.warn(`[omp-web] could not resume session ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }));
}

/** Look up the workspace-registered launch config; unregistered projects attach none. */
function launchConfigForCwd(cwd: string): ProjectLaunchConfig | undefined {
  let canonical = cwd;
  try { canonical = realpathSync(cwd); } catch {}
  const key = comparableProjectPath(canonical);
  return loadProjectRegistry().projects.find((project) => {
    if (project.hidden) return false;
    const projectKey = comparableProjectPath(project.path);
    return projectKey === key || key.startsWith(`${projectKey}-worktrees/`);
  })?.launchConfig;
}

/**
 * Get or create the omp RPC process for the given session.
 * For new sessions (sessionFile === ""), omp generates its own id.
 * Pass toolNames to pre-configure the builtin toolset of a NEW session
 * (empty array = all tools disabled); ignored when resuming.
 */
declare global {
  var __ompAgentToolGuard: AgentToolGuard | undefined;
}

/** Process-wide loop/spam guard for server agent tools (#275). Stored on
 * globalThis like the session registry so a hot reload does not silently
 * reset the chain depths mid-loop. */
function getAgentToolGuard(): AgentToolGuard {
  if (!globalThis.__ompAgentToolGuard) globalThis.__ompAgentToolGuard = new AgentToolGuard();
  return globalThis.__ompAgentToolGuard;
}

/**
 * Real session operations behind lib/agent-tools executeAgentTool.
 * Reuses the existing spawn/resume and message-send paths (startRpcSession,
 * wrapper.send) instead of a second session engine. Delivery rules, kept
 * explicit because omp's commands do not all make sense in every state:
 * - prompt: only when the target is idle (starts a new turn);
 * - steer: only when the target is running (steers that turn);
 * - followUp: any state (queues behind a running turn, or starts one
 *   when idle — omp owns the queue, as with the UI's follow-ups).
 * A waited delivery registers its turn-end waiter BEFORE sending, then
 * reads the turn's final text with get_last_assistant_text.
 */
function createAgentToolOps(): AgentToolSessionOps {
  return {
    async listSessions() {
      const running = new Set(getRunningRpcSessionIds());
      const sessions = await listAllSessions();
      return sessions.map((s) => ({ id: s.id, name: s.name, cwd: s.cwd, running: running.has(s.id) }));
    },

    async createSession(input) {
      if (!existsSync(input.cwd)) throw new Error(`Directory does not exist: ${input.cwd}`);
      const tempKey = `__new__${randomUUID()}`;
      const { session, realSessionId } = await startRpcSession(tempKey, "", input.cwd, undefined, undefined);
      allowFileRoot(input.cwd);
      invalidateSessionListCache();
      try {
        if (input.provider && input.modelId) {
          await session.send({ type: "set_model", provider: input.provider, modelId: input.modelId });
        }
        if (input.name) await session.send({ type: "set_session_name", name: input.name });
        if (input.prompt) await session.send({ type: "prompt", message: input.prompt });
      } catch (error) {
        await session.destroyAndWait();
        throw error;
      }
      return { sessionId: realSessionId };
    },

    async deliver(input): Promise<AgentToolDeliverResult> {
      const live = getRpcSession(input.sessionId);
      let wrapper = live?.isAlive() ? live : undefined;
      if (!wrapper) {
        const filePath = await resolveSessionPath(input.sessionId);
        if (!filePath) throw new Error(`Session not found: ${input.sessionId}`);
        const header = readSessionHeader(filePath);
        const { cwd } = resolveSpawnCwdResult(header?.cwd);
        const started = await startRpcSession(input.sessionId, filePath, cwd, undefined, undefined, header?.cwd);
        wrapper = started.session;
      }
      const wasRunning = wrapper.isRunning();
      if (input.delivery === "prompt" && wasRunning) {
        throw new Error("Target session is running; use delivery \"steer\" or \"followUp\" for a running target.");
      }
      if (input.delivery === "steer" && !wasRunning) {
        throw new Error("Target session is not running; use delivery \"prompt\" to start a turn.");
      }
      const terminalEndsNeeded = input.delivery === "followUp" && wasRunning ? 2 : 1;
      const waiter = input.wait ? wrapper.waitForTurnEnd(input.waitTimeoutMs, terminalEndsNeeded) : null;
      await wrapper.send({ type: input.delivery, message: input.message });
      if (!input.wait || !waiter) {
        return { accepted: true, targetSessionId: input.sessionId, delivery: input.delivery, waited: false, responseText: null };
      }
      await waiter;
      const last = (await wrapper.send({ type: "get_last_assistant_text" })) as { text?: unknown } | null;
      return {
        accepted: true,
        targetSessionId: input.sessionId,
        delivery: input.delivery,
        waited: true,
        responseText: typeof last?.text === "string" ? last.text : null,
      };
    },
  };
}

export async function startRpcSession(
  sessionId: string,
  sessionFile: string,
  cwd: string,
  toolNames?: string[],
  /** Spawn-time --advisor flag. Pass an explicit boolean to replace an idle
   * child whose flag differs; pass undefined to reuse whatever is alive. */
  advisor?: boolean,
  /** The cwd recorded in the session file header, used to detect a spawn
   * fallback (recorded dir gone) and warn the user. Omit for new sessions. */
  recordedCwd?: string | null,
  launchConfig?: ProjectLaunchConfig,
  /** Model to bind at spawn time as `provider/modelId` (--model). Only used
   * when resuming: it replaces the saved model and skips its restore check,
   * so a cold set_model can recover a session whose saved model is gone
   * (#277). Ignored when a live child is reused; the caller's set_model RPC
   * then runs against that child as before. The spawn alone does not rewrite
   * the session file, so a later spawn without an override still hits the
   * old saved model until omp records a new one (a successful set_model RPC
   * or a completed turn); the picker path re-binds on each cold switch, so
   * the user is never stuck on the unrestorable model. */
  spawnModel?: string,
): Promise<{ session: AgentSessionWrapper; realSessionId: string }> {
  const registry = getRegistry();
  const locks = getLocks();
  launchConfig = launchConfig ?? launchConfigForCwd(cwd);
  // Union semantics, matching the spawn below and the wrapper identity:
  // workspace advisor=true forces the flag on. The gate must compare this
  // same effective value — comparing the raw toggle would destroy+respawn a
  // workspace-forced child on every toggle-off prompt.
  const effectiveAdvisor = advisor === true || launchConfig?.advisor === true;

  const existing = registry.get(sessionId);
  if (existing?.isAlive()) {
    // --advisor is a spawn-time flag with no runtime RPC. When the caller
    // carries an explicit advisor setting that differs from the live child's,
    // replace the child so the toggle takes effect on the next prompt. Busy
    // children are kept (a mid-run swap would drop in-flight work) and pick
    // the new flag up at the next natural respawn; callers that pass no
    // advisor opinion (undefined) simply reuse whatever is running.
    if (advisor === undefined || existing.advisorSpawned === effectiveAdvisor || existing.isRunning() || existing.isEditingHistory()) {
      return { session: existing, realSessionId: sessionId };
    }
    await existing.destroyAndWait();
  }
  // A wrapper whose omp child is still flushing/exiting must fully dispose
  // before a replacement spawns — two children touching the same .jsonl would
  // race on resume/delete/archive.
  if (existing?.destroyPromise) await existing.destroyPromise;

  // omp >= 18.5 lets only one process own a session file; a second `--resume`
  // child would fork into a new nested session on its first write. Reuse the
  // live wrapper that already reports this file (e.g. after it moved files).
  if (sessionFile && !existing) {
    for (const candidate of new Set(registry.values())) {
      if (candidate.isAlive() && candidate.sessionFile && samePath(candidate.sessionFile, sessionFile)) {
        registry.set(sessionId, candidate);
        return { session: candidate, realSessionId: candidate.sessionId };
      }
    }
  }

  const inflight = locks.get(sessionId);
  if (inflight) return inflight;

  const starting = (async () => {
    // The wrapper needs the process and the process's onExit needs the wrapper;
    // the holder breaks that cycle (onExit only fires once the child dies).
    const holder: { wrapper?: AgentSessionWrapper } = {};
    const proc = new RpcProcess({
      cwd,
      // User-configured variables for MCP servers and generated configs (#104).
      env: getAgentEnvOverrides(),
      extraArgs: [...buildSessionSpawnArgs(sessionFile, toolNames, advisor === true, launchConfig, spawnModel), "--extension", SESSION_EDIT_EXTENSION_PATH],
      onExit: (info) => holder.wrapper?.handleProcessExit(info, proc),
    });
    const created = new AgentSessionWrapper(
      proc,
      cwd,
      recordedCwd,
      advisor === true || launchConfig?.advisor === true,
      sessionFile ? sessionId : "",
    );
    holder.wrapper = created;
    created.start();
    try {
      await created.waitUntilReady();
      // A fresh spawn (no --resume) must never land in an existing conversation:
      // omp's startup resume handling can be config- or version-driven into
      // continuing the cwd's most recent session, which would silently send the
      // first prompt into an old .jsonl. The child's reported session file
      // existing on disk is the resume signal — a genuinely fresh child reports
      // a path it has not created yet (session files are written lazily on the
      // first message), so this never fires for a real new session.
      if (!sessionFile && created.sessionFile && existsSync(created.sessionFile)) {
        await created.send({ type: "new_session" });
      }
      // Register server agent tools (#275) at startup when the gate is on,
      // so a session works for agent-to-agent calls even when no browser
      // tab ever registers host tools for it. send() merges these with any
      // later UI registration, so this never drops the UI tools. Older omp
      // builds without host tools simply reject the registration; ignore
      // that the way the UI registration does.
      if (loadWebServerSettings().agentToolsEnabled) {
        await created.send({ type: "set_host_tools", tools: AGENT_TOOL_DEFINITIONS }).catch(() => {});
      }
    } catch (error) {
      // Await the child's full exit before the `finally` releases the startup
      // lock: a fire-and-forget destroy() would let a retry spawn a second
      // OMP child while the failed one is still flushing/exiting, and
      // concurrent resume/delete/archive paths could race that old child.
      await created.destroyAndWait();
      throw error;
    }

    const realSessionId = created.sessionId;
    created.onDestroy(() => {
      // Drop every key (current id, original id, moved-from aliases).
      for (const [key, wrapper] of registry) if (wrapper === created) registry.delete(key);
    });
    created.onIdentityChange((oldId, newId, options) => {
      if (!options?.keepOldId && registry.get(oldId) === created) registry.delete(oldId);
      registry.set(newId, created);
    });
    registry.set(realSessionId, created);
    // A successful respawn supersedes the crash record.
    clearExitedRpcSession(sessionId);
    if (realSessionId !== sessionId) clearExitedRpcSession(realSessionId);
    return { session: created, realSessionId };
  })().finally(() => locks.delete(sessionId));

  locks.set(sessionId, starting);
  return starting;
}


bindSessionLifecycle({
  notifyRunningChange,
  getExitedMap,
  buildSessionSpawnArgs,
  launchConfigForCwd,
});
bindCommandDispatch({
  notifyRunningChange,
  patchEstimatedTokensAfter,
});
bindSessionTitle({
  notifyRunningChange,
});
