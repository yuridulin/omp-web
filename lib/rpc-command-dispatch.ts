// Command dispatch for one live omp session. Tables and ask-answer checks live here.
import { AGENT_TOOL_DEFINITIONS } from "./agent-tools";
import { validateAgentImages } from "./image-attachments";
import { invalidateModelsCache } from "./models-cache";
import { RpcCommandError, RpcCommandTimeoutError, type RpcProcess } from "./omp/rpc-process";
import { SESSION_EDIT_COMMAND } from "./omp/session-edit";
import type {
  BashResultInfo,
  OmpModel,
  RpcAvailableSlashCommand,
  RpcSessionState,
  SessionStatsInfo,
} from "./pi-types";
import { isRecord } from "./type-guards";
import { loadWebServerSettings } from "./web-settings";

/**
 * Failure raised by omp-web itself (not by omp) carrying a stable snake_case
 * code. API routes forward `{ error, code }` so the client dictionary can
 * localize it via `errors.<code>` while unknown codes fall back to the text.
 */
export class WebRpcError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "WebRpcError";
    this.code = code;
  }
}

export const RESTARTING_MESSAGE = "This session is restarting — retry in a moment.";
const BASH_EXCLUDE_MESSAGE =
  "omp cannot run a shell command with its output excluded from the model context (`!!`): the RPC bash command has no exclusion option, so the output would silently enter the context anyway. Run it with a single `!` to share the output with the model, or use a terminal outside omp web.";
export const GET_STATE_TIMEOUT_MS = 5_000;
/** Cap on the *acknowledgement* of a prompt frame — not on model execution.
 * omp acks a prompt as soon as it accepts it and the run then reports through
 * events (agent_start/agent_end), so an ack that never arrives means the child
 * is wedged: without this the API request (and the UI spinner behind it) would
 * stay pending forever. Generous enough to cover slow local startup work the
 * child does before acking. */
export const PROMPT_ACK_TIMEOUT_MS = 30_000;
const AWAITING_AGENT_START_TIMEOUT_MS = 10_000;

/** Shape check for an ask-dialog `answers` payload; omp validates the content. */
function isAskAnswers(value: unknown): boolean {
  return Array.isArray(value) && value.every((answer: unknown) =>
    isRecord(answer)
    && typeof answer.id === "string"
    && Array.isArray(answer.selectedOptions)
    && answer.selectedOptions.every((option: unknown) => typeof option === "string")
    && (answer.customInput === undefined || typeof answer.customInput === "string"));
}

// Commands forwarded to omp verbatim (request shape already matches rpc-types).
const PASSTHROUGH_COMMANDS = new Set([
  "abort",
  "abort_and_prompt",
  "set_thinking_level",
  "cycle_thinking_level",
  "cycle_model",
  "get_available_models",
  "set_auto_compaction",
  "set_auto_retry",
  "abort_retry",
  "abort_bash",
  "set_todos",
  "set_steering_mode",
  "set_follow_up_mode",
  "set_interrupt_mode",
  "get_branch_messages",
  "get_messages",
  "get_messages_page",
  "export_html",
  "handoff",
  "get_subagents",
  "get_subagent_messages",
  "set_subagent_subscription",
  "get_login_providers",
  "login",
  "predict_word",
  "predict_word_feedback",
  "btw",
  "btw_cancel",
  "get_btw_history",
]);

// Outlasts omp's cold prediction-daemon start (up to 3 × 30s start rounds plus a
// 30s first completion), so omp's answer or error decides; a wedged daemon still
// cannot pin the request forever.
const PREDICT_WORD_TIMEOUT_MS = 125_000;

// Commands that can carry user-attached images to the model. All of them must
// pass the same server-side per-image/count/aggregate validation before the
// payload reaches omp — a client is free to POST any of them directly.
const IMAGE_BEARING_COMMANDS = new Set(["prompt", "steer", "follow_up", "abort_and_prompt"]);

// These commands can append to, replace, or resume the active history. Edits
// fence them across every attached client, including mutations already awaiting
// a native acknowledgement when an edit arrives. Read-only queries and dialog
// replies remain available while a navigation hook is running.
const HISTORY_MUTATING_COMMANDS = new Set([
  "edit_message", "prompt", "steer", "follow_up", "abort", "abort_and_prompt",
  "abort_and_restore_queue", "remove_queued_message", "promote_queued_message",
  "fork", "new_session", "switch_session", "compact", "abort_compaction",
  "reload", "bash", "abort_bash", "handoff", "set_todos", "set_session_name",
  "set_model", "cycle_model", "set_thinking_level", "cycle_thinking_level",
  "set_fast_mode", "set_slow_mode", "set_auto_compaction", "set_auto_retry", "abort_retry",
]);

// pi-web commands with no omp RPC equivalent. The UI tolerates these failing.
const UNSUPPORTED_COMMANDS: Record<string, string> = {
  navigate_tree: "Branch navigation is not supported over the omp RPC protocol",
  clear_queue: "Recalling queued messages is not supported over the omp RPC protocol",
  get_tools: "Per-session tool listing is not supported over the omp RPC protocol",
  set_tools: "Changing tools on a running session is not supported over the omp RPC protocol; tool presets apply to new sessions",
  extension_ui_input: "Extension custom UI is not supported over the omp RPC protocol",
};

function toImageContents(value: unknown): Array<{ type: "image"; data: string; mimeType: string }> | undefined {
  const images = value as Array<{ type: "image"; data: string; mimeType: string }> | undefined;
  return images?.length ? images : undefined;
}

interface CompactionResultLike {
  summary?: string;
  tokensBefore?: number;
  estimatedTokensAfter?: number;
  /** omp ≥17.4 reports the real post-compaction count when available. */
  tokensAfter?: number;
}

type NotifyRunningChange = (options?: { refreshSessionList?: boolean }) => void;

function unbound(name: string): never {
  throw new Error(`rpc command dispatch is not bound (${name})`);
}

let notifyRunningChange: NotifyRunningChange = () => { unbound("notifyRunningChange"); };
let patchEstimatedTokensAfter: (result: unknown) => void = () => { unbound("patchEstimatedTokensAfter"); };

export function bindCommandDispatch(bindings: {
  notifyRunningChange: NotifyRunningChange;
  patchEstimatedTokensAfter: (result: unknown) => void;
}): void {
  notifyRunningChange = bindings.notifyRunningChange;
  patchEstimatedTokensAfter = bindings.patchEstimatedTokensAfter;
}

interface CommandDispatchSession {
  restarting: boolean;
  mcpListInFlight: boolean;
  historyEditInFlight: boolean;
  historyMutationPendingCount: number;
  pendingCommands: number;
  bashRunning: boolean;
  responseObserved: boolean;
  responseRunActive: boolean;
  promptRunning: boolean;
  promptDispatchPendingCount: number;
  awaitingAgentStart: boolean;
  awaitingAgentStartDeadline: number;
  continuationGraceUntil: number;
  streaming: boolean;
  compacting: boolean;
  streamSequence: number;
  fastModeEnabled: boolean;
  _sessionId: string;
  _sessionName: string | undefined;
  pendingUiRequests: Map<string, { method?: unknown; [key: string]: unknown }>;
  pendingHostTools: Map<string, unknown>;
  pendingHostUris: Map<string, unknown>;
  hostToolNames: Set<string>;
  hostUriSchemes: Map<string, { writable?: boolean }>;
  proc: RpcProcess;
  isAlive(): boolean;
  isRunning(): boolean;
  resetIdleTimer(force?: boolean): void;
  dispatchCommand(command: Record<string, unknown>): Promise<unknown>;
  queueWhileShellRunning(command: Record<string, unknown>): Promise<unknown>;
  clearLiveSnapshots(): void;
  emit(event: { type: string; [key: string]: unknown }): void;
  destroyAndWait(reason?: string): Promise<void>;
  withFinalRunningNotification<T>(operation: () => Promise<T>): Promise<T>;
  buildWebState(state: RpcSessionState): unknown;
  requireSkillDiagnostics(value: unknown): unknown;
  editMessage(entryId: unknown): Promise<unknown>;
  refreshIdentityAfterSessionChange(): Promise<string>;
  invalidateSessionLists(): void;
  restart(): Promise<void>;
  forgetPendingUiRequest(id: string): void;
}

export async function send(this: CommandDispatchSession, command: Record<string, unknown>): Promise<unknown> {
  if (this.restarting) throw new WebRpcError(RESTARTING_MESSAGE, "session_restarting");
  if (this.mcpListInFlight) throw new WebRpcError("MCP management is in progress. Try again when it finishes.", "session_busy");
  if (!this.isAlive()) throw new Error("Session is no longer running");
  if (typeof command.type === "string" && command.type.startsWith("abort")) {
    console.info("[omp-web] cancellation-command", JSON.stringify({ sessionId: this._sessionId, type: command.type, at: new Date().toISOString() }));
  }
  const mutatesHistory = HISTORY_MUTATING_COMMANDS.has(command.type as string);
  if (mutatesHistory && this.historyEditInFlight) {
    throw new WebRpcError("Wait for the history edit to finish", "session_busy");
  }
  if (mutatesHistory) this.historyMutationPendingCount += 1;
  this.resetIdleTimer();
  // Covers the whole command, including the awaits inside it: a route that
  // has an unwatched session in mid-command (predict_word on a keystroke, an
  // export, a follow-up) must never have its child reaped underneath it.
  this.pendingCommands += 1;
  try {
    return await this.dispatchCommand(command);
  } finally {
    this.pendingCommands = Math.max(0, this.pendingCommands - 1);
    if (mutatesHistory) this.historyMutationPendingCount -= 1;
  }
}

export async function dispatchCommand(this: CommandDispatchSession, command: Record<string, unknown>): Promise<unknown> {
  const type = command.type as string;

  if (IMAGE_BEARING_COMMANDS.has(type)) {
    const imageError = validateAgentImages(command.images);
    if (imageError) throw new Error(imageError);
  }

  const unsupported = UNSUPPORTED_COMMANDS[type];
  if (unsupported) throw new RpcCommandError(type, unsupported, "unsupported");

  switch (type) {
    case "prompt": {
      // A `!!` shell command owns the session until it exits (omp rejects a
      // prompt then, and treating that as a hard error tore down the client's
      // optimistic turn and lost the message). Degrade into omp's own
      // follow-up queue instead: omp keeps owning the chips and delivers the
      // message once the shell command releases the session.
      if (this.bashRunning) return await this.queueWhileShellRunning(command);
      const streamingBehavior = command.streamingBehavior as "steer" | "followUp" | undefined;
      if (!streamingBehavior) {
        this.responseObserved = false;
        this.responseRunActive = false;
        if (!this.isRunning()) this.clearLiveSnapshots();
        this.streamSequence += 1;
        this.promptRunning = true;
        this.promptDispatchPendingCount += 1;
        this.awaitingAgentStart = false;
        this.awaitingAgentStartDeadline = 0;
        this.continuationGraceUntil = 0;
        notifyRunningChange();
      }
      try {
        // omp acks immediately; agent output streams as events, completion is
        // agent_end (agent runs) or prompt_result (local-only slash commands).
        const ack = await this.proc.sendCommand<{ agentInvoked?: boolean } | undefined>({
          type: "prompt",
          message: command.message as string,
          ...(toImageContents(command.images) ? { images: toImageContents(command.images) } : {}),
          ...(streamingBehavior ? { streamingBehavior } : {}),
        }, PROMPT_ACK_TIMEOUT_MS);
        // Slash commands fully consumed by a builtin report agentInvoked:false
        // in the ack itself — no prompt_result frame follows.
        if (ack?.agentInvoked === false && !streamingBehavior) {
          this.promptRunning = false;
          this.awaitingAgentStart = false;
          this.awaitingAgentStartDeadline = 0;
          this.emit({ type: "prompt_result", agentInvoked: false });
          notifyRunningChange();
        } else if (!streamingBehavior && ack?.agentInvoked !== false) {
          // OMP acked but agent hasn't started yet — keep promptRunning alive
          // until agent_start arrives (or a timeout expires).
          this.awaitingAgentStart = true;
          this.awaitingAgentStartDeadline = Date.now() + AWAITING_AGENT_START_TIMEOUT_MS;
        }
      } catch (error) {
        this.promptRunning = false;
        this.awaitingAgentStart = false;
        this.awaitingAgentStartDeadline = 0;
        this.streaming = false;
        this.clearLiveSnapshots();
        notifyRunningChange();
        if (error instanceof RpcCommandTimeoutError) {
          // The child took the frame but never acked it, so nothing will ever
          // report this run: recycle the unacknowledged prompt. A read-only
          // get_state timeout deliberately does not take this destructive path.
          await this.destroyAndWait();
          throw new WebRpcError("The OMP session stopped responding and was reset.", "session_unresponsive");
        }
        throw error;
      } finally {
        if (!streamingBehavior) {
          this.promptDispatchPendingCount = Math.max(0, this.promptDispatchPendingCount - 1);
        }
      }
      return null;
    }

    case "steer":
    case "follow_up": {
      // `steer` has the same collision while a `!!` shell command runs — and
      // there is no live turn to steer anyway, so it joins the follow-up
      // queue like a prompt would.
      if (type === "steer" && this.bashRunning) return await this.queueWhileShellRunning(command);
      await this.proc.sendCommand({
        type,
        message: command.message as string,
        ...(toImageContents(command.images) ? { images: toImageContents(command.images) } : {}),
      });
      return null;
    }

    case "remove_queued_message":
    case "promote_queued_message": {
      // Queue mutations are synchronous control operations, like get_state.
      // Expiry must not abort unrelated work or replay a possibly applied mutation.
      const result = await this.proc.sendCommand(command as { type: string }, GET_STATE_TIMEOUT_MS);
      return result ?? null;
    }

    // abort_and_restore_queue is omp's Esc: it takes queued user input back
    // atomically, then aborts, and returns the withdrawn messages.
    case "abort":
    case "abort_and_restore_queue": {
      this.responseObserved = false;
      this.responseRunActive = false;
      const result = await this.withFinalRunningNotification(async () => {
        const response: unknown = await this.proc.sendCommand({ type });
        // If the prompt was aborted before the agent loop started, no
        // agent_end will arrive to clear the flag; the streaming flag still
        // tracks a live turn that ends with its own agent_end.
        this.promptRunning = false;
        // Clear the pending-start bookkeeping too: hasPendingWork would
        // otherwise suppress stale-state reconciliation for the full
        // AWAITING_AGENT_START_TIMEOUT_MS, leaving the UI showing "running"
        // after an early abort.
        this.awaitingAgentStart = false;
        this.awaitingAgentStartDeadline = 0;
        this.continuationGraceUntil = 0;
        this.clearLiveSnapshots();
        return response;
      });
      return type === "abort" ? null : result ?? null;
    }

    case "get_state": {
      try {
        const state = await this.proc.sendCommand<RpcSessionState>({ type: "get_state" }, GET_STATE_TIMEOUT_MS);
        return this.buildWebState(state);
      } catch (error) {
        if (error instanceof RpcCommandTimeoutError) {
          // This is only an observer poll. A busy event loop or delayed RPC
          // response is not authority to stop generation or a pending tool.
          console.warn("[omp-web] status-query-timeout", JSON.stringify({ sessionId: this._sessionId, timeoutMs: GET_STATE_TIMEOUT_MS, running: this.isRunning(), action: "preserved", at: new Date().toISOString() }));
          throw new WebRpcError("The OMP status query timed out. The session was left running; retry shortly.", "session_state_timeout");
        }
        throw error;
      }
    }

    case "get_skill_diagnostics": {
      const result = await this.proc.sendCommand<unknown>({ type: "get_skill_diagnostics" }, GET_STATE_TIMEOUT_MS);
      return this.requireSkillDiagnostics(result);
    }

    case "set_skill_startup_diagnostics": {
      if (typeof command.enabled !== "boolean") {
        throw new WebRpcError("enabled must be a boolean", "invalid_skill_startup_diagnostics");
      }
      const result = await this.proc.sendCommand<unknown>({
        type: "set_skill_startup_diagnostics",
        enabled: command.enabled,
      }, GET_STATE_TIMEOUT_MS);
      return this.requireSkillDiagnostics(result);
    }

    case "set_model": {
      const { provider, modelId } = command as { provider: string; modelId: string };
      const model = await this.proc.sendCommand<OmpModel>({ type: "set_model", provider, modelId });
      invalidateModelsCache();
      this.invalidateSessionLists();
      return { id: model.id, provider: model.provider };
    }

    case "set_fast_mode": {
      const enabled = command.enabled === true;
      const result = await this.proc.sendCommand<{ enabled?: boolean; active?: boolean }>({ type: "set_fast_mode", enabled });
      this.fastModeEnabled = result?.enabled ?? enabled;
      return { enabled: this.fastModeEnabled, active: result?.active ?? false };
    }

    case "set_slow_mode": {
      const enabled = command.enabled === true;
      const result = await this.proc.sendCommand<{ enabled?: boolean }>({ type: "set_slow_mode", enabled });
      return { enabled: result?.enabled ?? enabled };
    }

    case "edit_message":
      return this.editMessage(command.entryId);

    case "fork": {
      // omp's `branch` is pi-web's fork: it creates a branched session file
      // and switches this live process onto it (entryId must be a user
      // message entry, matching the web UI's fork buttons).
      if (this.bashRunning) {
        throw new Error("Cannot fork while a shell command is running");
      }
      const result = await this.proc.sendCommand<{ text: string; cancelled: boolean }>({
        type: "branch",
        entryId: command.entryId as string,
      });
      if (result.cancelled) return { cancelled: true };
      const newSessionId = await this.refreshIdentityAfterSessionChange();
      // `text` is the branched prompt omp hands back for edit-and-resend.
      return { cancelled: false, newSessionId, text: result.text };
    }

    case "new_session":
    case "switch_session": {
      const result = await this.proc.sendCommand<{ cancelled: boolean }>(command as { type: string });
      if (!result.cancelled) {
        const newSessionId = await this.refreshIdentityAfterSessionChange();
        return { cancelled: false, newSessionId };
      }
      return result;
    }

    case "compact": {
      try {
        return await this.withFinalRunningNotification(async () => {
          this.compacting = true;
          this.streamSequence += 1;
          notifyRunningChange();
          try {
            const result = await this.proc.sendCommand<CompactionResultLike>({
              type: "compact",
              ...(command.customInstructions ? { customInstructions: command.customInstructions } : {}),
            });
            patchEstimatedTokensAfter(result);
            return result;
          } finally {
            this.compacting = false;
            this.streamSequence += 1;
          }
        });
      } finally {
        this.invalidateSessionLists();
      }
    }

    case "abort_compaction":
      // No dedicated RPC command; a plain abort cancels the in-flight turn
      // including compaction work.
      await this.withFinalRunningNotification(() => this.proc.sendCommand({ type: "abort" }));
      return null;

    case "set_session_name": {
      const name = (command.name as string | undefined)?.trim();
      if (!name) throw new Error("Session name cannot be empty");
      await this.proc.sendCommand({ type: "set_session_name", name });
      this._sessionName = name;
      this.invalidateSessionLists();
      return null;
    }

    case "get_session_stats": {
      const stats = await this.proc.sendCommand<Omit<SessionStatsInfo, "sessionName">>({ type: "get_session_stats" });
      return { ...stats, sessionName: this._sessionName };
    }

    case "get_last_assistant_text": {
      const data = await this.proc.sendCommand<{ text: string | null }>({ type: "get_last_assistant_text" });
      return { text: data.text ?? "" };
    }

    case "get_commands": {
      const data = await this.proc.sendCommand<{ commands: RpcAvailableSlashCommand[] }>({
        type: "get_available_commands",
      });
      return { ...data, commands: data.commands.filter((command) => command.name !== SESSION_EDIT_COMMAND) };
    }

    case "reload": {
      await this.restart();
      return { success: true };
    }

    case "extension_ui_response": {
      const { id, ...rest } = command as { id: string; [key: string]: unknown };
      const pendingAsk = this.pendingUiRequests.get(id)?.method === "ask";
      // A pending ask accepts only its answers or a cancel; anything else would
      // drop it from reconnect replay while omp rejects the payload.
      if (("answers" in rest || pendingAsk) && !isAskAnswers(rest.answers) && !(pendingAsk && rest.cancelled === true)) {
        throw new WebRpcError("Invalid ask dialog answers", "invalid_ask_answers");
      }
      const wasPending = this.pendingUiRequests.has(id);
      this.forgetPendingUiRequest(id);
      this.proc.sendFrame({ type: "extension_ui_response", id, ...rest });
      // omp sends no cancel for an answered dialog; other tabs on this
      // session would keep showing it, so settle it for them here.
      if (wasPending) this.emit({ type: "extension_ui_request", id: `cancel:${id}`, method: "cancel", targetId: id });
      return null;
    }

    case "bash": {
      // omp's RPC bash command is `{type:"bash", command}` only (rpc-types.ts)
      // — there is no excludeFromContext option anywhere in modes/rpc. Running
      // a `!!` command anyway would put output the user meant to keep private
      // into the model context, so refuse instead of silently ignoring it.
      if (command.excludeFromContext === true) {
        throw new WebRpcError(BASH_EXCLUDE_MESSAGE, "bash_exclude_unsupported");
      }
      if (this.isRunning()) {
        throw new Error("Cannot run a shell command while the session is busy");
      }
      this.bashRunning = true;
      notifyRunningChange();
      try {
        return await this.proc.sendCommand<BashResultInfo>({ type: "bash", command: command.command as string });
      } finally {
        this.bashRunning = false;
        this.invalidateSessionLists();
        notifyRunningChange();
      }
    }

    case "set_host_tools": {
      const tools = Array.isArray(command.tools) ? command.tools as Array<{ name?: unknown; [key: string]: unknown }> : [];
      const valid = tools.filter((t) => typeof t.name === "string" && t.name);
      // Merge the server agent tools (#275) into every registration when
      // the gate is on, so a later UI registration cannot drop them and
      // a no-tab session keeps them after its startup registration.
      // With the gate off the registration is exactly what the caller
      // asked for, so existing behavior and tests are unchanged.
      const merged = loadWebServerSettings().agentToolsEnabled
        ? [...valid, ...AGENT_TOOL_DEFINITIONS.filter((t) => !valid.some((v) => v.name === t.name))]
        : valid;
      this.hostToolNames = new Set(merged.map((t) => t.name as string));
      await this.proc.sendCommand({ type: "set_host_tools", tools: merged });
      return null;
    }

    case "host_tool_result": {
      if (typeof command.id === "string") this.pendingHostTools.delete(command.id);
      this.proc.sendFrame(command as { type: string; [key: string]: unknown });
      return null;
    }

    case "set_host_uri_schemes": {
      const schemes = Array.isArray(command.schemes) ? command.schemes as Array<{ scheme?: unknown; writable?: unknown; [key: string]: unknown }> : [];
      this.hostUriSchemes = new Map();
      for (const entry of schemes) {
        if (typeof entry.scheme === "string" && entry.scheme) {
          this.hostUriSchemes.set(entry.scheme, { writable: entry.writable === true });
        }
      }
      await this.proc.sendCommand({ type: "set_host_uri_schemes", schemes });
      return null;
    }

    case "host_uri_result": {
      if (typeof command.id === "string") this.pendingHostUris.delete(command.id);
      this.proc.sendFrame(command as { type: string; [key: string]: unknown });
      return null;
    }

    default: {
      if (PASSTHROUGH_COMMANDS.has(type)) {
        if (type === "abort_and_prompt") {
          this.responseObserved = false;
          this.responseRunActive = false;
          this.streamSequence += 1;
        }
        const result: unknown = await this.proc.sendCommand(
          command as { type: string },
          type === "predict_word" ? PREDICT_WORD_TIMEOUT_MS : undefined,
        );
        if (type === "set_thinking_level") this.invalidateSessionLists();
        return result ?? null;
      }
      throw new Error(`Unsupported command: ${type}`);
    }
  }
}

/**
 * Degrade a prompt/steer frame into omp's follow-up queue while omp-web's own
 * `!!` shell command owns the child (`bashRunning`, set for the whole `bash`
 * RPC). omp would refuse a prompt then — and aborting or erroring loses the
 * user's message mid-task — so the message is forwarded as `follow_up`
 * instead: the queue stays omp-owned (its `queue_update`/`get_state`
 * snapshots feed every client's chips) and omp delivers the message after the
 * shell command finishes, exactly as a queued follow-up sent during a run.
 * The reply carries the degradation so the client can tell the user their
 * message was queued, not steered.
 */
export async function queueWhileShellRunning(this: CommandDispatchSession, command: Record<string, unknown>): Promise<unknown> {
  const images = toImageContents(command.images);
  await this.proc.sendCommand({
    type: "follow_up",
    message: command.message as string,
    ...(images ? { images } : {}),
  });
  return { queued: true, queue: "followUp", reason: "shellRunning" };
}
