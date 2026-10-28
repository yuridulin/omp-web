import type { AgentMessage, UserMessage } from "@/lib/types";
import {
  isTerminalAgentEnd,
  readAssistantPayload,
  readCursor,
  readErrorMessage,
  readQueueSnapshot,
  readTerminalAgentError,
  readToolResult,
  type WireEvent,
} from "./protocol";
import {
  MAX_NOTICES,
  hasVisibleAssistantContent,
  userMessageText,
  type ConnectionStatus,
  type Notice,
  type SessionState,
} from "./state";

/**
 * Pure transition function for one session.
 *
 * Every input is data — a wire frame, a history read, a user intent — and every
 * output is state. No timers, no I/O, no rendering: the same sequence of
 * actions produces the same state, which is what makes the behaviour testable.
 */

export type SessionAction =
  | { type: "connection"; status: ConnectionStatus; streamId?: string | null }
  | { type: "frame"; frame: WireEvent; at: number }
  | { type: "history"; messages: AgentMessage[]; entryIds: string[] }
  | { type: "prompt"; message: UserMessage }
  | { type: "prompt-settled"; accepted: boolean; reason?: string; at: number }
  | { type: "notice"; notice: Notice }
  | { type: "dismiss-notice"; id: string }
  | { type: "view"; view: Partial<SessionState["view"]> }
  | { type: "reset"; sessionId: string | null };

export function reduce(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "connection":
      return applyConnection(state, action.status, action.streamId);
    case "frame":
      return applyFrame(state, action.frame, action.at);
    case "history":
      return applyHistory(state, action.messages, action.entryIds);
    case "prompt":
      return { ...state, optimistic: action.message, lastError: null };
    case "prompt-settled": {
      if (action.accepted) return state;
      const notices = pushNotice(state, {
        id: `prompt-${action.at}`,
        type: "error",
        message: action.reason ?? "The prompt was rejected.",
        at: action.at,
      });
      return { ...notices, optimistic: null, lastError: action.reason ?? "The prompt was rejected." };
    }
    case "notice":
      return pushNotice(state, action.notice);
    case "dismiss-notice":
      return { ...state, notices: state.notices.filter((notice) => notice.id !== action.id) };
    case "view":
      return {
        ...state,
        view: { ...state.view, ...action.view },
        // A different branch or compaction window is a different transcript.
        historyRevision: state.historyRevision + 1,
      };
    case "reset":
      return {
        ...state,
        sessionId: action.sessionId,
        view: { leafId: null, includePreCompaction: false },
        messages: [],
        entryIds: [],
        optimistic: null,
        stream: { active: false, message: null, held: false },
        queue: { steering: [], followUp: [], revision: state.queue.revision + 1 },
        toolResults: {},
        run: { ...state.run, status: "idle", hadContent: false, error: null },
        notices: [],
        lastError: null,
        sequence: 0,
        streamId: null,
        historyRevision: state.historyRevision + 1,
      };
    default:
      return state;
  }
}

function applyConnection(
  state: SessionState,
  status: ConnectionStatus,
  streamId?: string | null,
): SessionState {
  const nextStreamId = streamId === undefined ? state.streamId : streamId;
  const streamChanged = nextStreamId !== state.streamId;
  return {
    ...state,
    connection: status,
    streamId: nextStreamId,
    sequence: streamChanged ? 0 : state.sequence,
    // A new stream means the runtime restarted: live snapshots and ordering
    // from the previous one are meaningless, and the transcript must be re-read.
    stream: streamChanged ? { active: false, message: null, held: false } : state.stream,
    toolResults: streamChanged ? {} : state.toolResults,
    historyRevision: streamChanged ? state.historyRevision + 1 : state.historyRevision,
  };
}

/** Apply a live frame, dropping anything the stream already moved past. */
function applyFrame(state: SessionState, frame: WireEvent, at: number): SessionState {
  const cursor = readCursor(frame);
  let next = state;

  if (cursor?.streamId && cursor.streamId !== state.streamId) {
    next = applyConnection(state, state.connection, cursor.streamId);
    if (cursor.sequence !== null) next = { ...next, sequence: cursor.sequence };
  } else if (cursor?.sequence !== null && cursor?.sequence !== undefined) {
    if (cursor.sequence <= next.sequence) return state;
    next = { ...next, sequence: cursor.sequence };
  }

  switch (frame.type) {
    case "connected":
      return { ...next, connection: "open" };

    case "agent_start":
      return {
        ...next,
        run: { status: "running", id: next.run.id + 1, hadContent: false, error: null },
        stream: { active: true, message: null, held: false },
        toolResults: {},
        historyRevision: next.historyRevision + 1,
      };

    case "message_start":
      return { ...next, stream: { active: true, message: next.stream.message, held: false } };

    case "message_update": {
      const message = readAssistantPayload(frame.message);
      if (!message) return next;
      return {
        ...next,
        stream: { active: true, message, held: false },
        run: {
          ...next.run,
          hadContent: next.run.hadContent || hasVisibleAssistantContent(message),
        },
      };
    }

    case "message_end": {
      const message = readAssistantPayload(frame.message) ?? next.stream.message;
      const visible = hasVisibleAssistantContent(message);
      return {
        ...next,
        stream: { active: false, message: visible ? message : null, held: visible },
        run: { ...next.run, hadContent: next.run.hadContent || visible },
      };
    }

    case "agent_end": {
      if (!isTerminalAgentEnd(frame)) return next;
      const error = readTerminalAgentError(frame) ?? next.run.error;
      const silent = !next.run.hadContent && !error;
      const withNotice = error ? pushNotice(next, noticeFor(next, "error", error, at)) : next;
      return {
        ...withNotice,
        run: { ...withNotice.run, status: "idle", error },
        stream: { ...withNotice.stream, active: false },
        lastError: error ?? withNotice.lastError,
        // A run that ended without visible output may still have written to the
        // session file (resume, compaction): re-read instead of asserting empty.
        historyRevision: silent ? withNotice.historyRevision + 1 : withNotice.historyRevision,
      };
    }

    case "tool_execution_start":
    case "tool_execution_update": {
      const toolCallId = typeof frame.toolCallId === "string" ? frame.toolCallId : null;
      const result = readToolResult(frame, toolCallId);
      if (!result || !toolCallId) return next;
      return { ...next, toolResults: { ...next.toolResults, [toolCallId]: result } };
    }

    case "queue_update": {
      const snapshot = readQueueSnapshot(frame.queuedMessages ?? frame.queue ?? frame);
      if (!snapshot) return next;
      return { ...next, queue: { ...snapshot, revision: next.queue.revision + 1 } };
    }

    case "prompt_result": {
      const error = readErrorMessage(frame);
      if (!error) return { ...next, optimistic: null };
      return reduce(
        { ...next, optimistic: null },
        { type: "notice", notice: noticeFor(next, "error", error, at) },
      );
    }

    case "session_history_changed":
      return { ...next, historyRevision: next.historyRevision + 1 };

    case "turn_error":
    case "agent_error":
    case "model_error":
    case "server_error":
    case "internal_error":
    case "rpc_frame_error":
    case "error": {
      const message = readErrorMessage(frame) ?? "The agent reported an error.";
      return {
        ...pushNotice(next, noticeFor(next, "error", message, at)),
        run: { ...next.run, error: message },
        lastError: message,
      };
    }

    case "notice": {
      const message = readErrorMessage(frame);
      if (!message) return next;
      const kind = typeof frame.level === "string" && isNoticeType(frame.level) ? frame.level : "info";
      return pushNotice(next, noticeFor(next, kind, message, at));
    }

    default:
      return next;
  }
}

function applyHistory(
  state: SessionState,
  messages: AgentMessage[],
  entryIds: string[],
): SessionState {
  const optimistic = state.optimistic
    && messages.some((message) => message.role === "user" && userMessageText(message) === userMessageText(state.optimistic!))
    ? null
    : state.optimistic;

  return {
    ...state,
    messages,
    entryIds,
    optimistic,
    stream: releaseHeldStream(state.stream, messages),
  };
}

/** Drop a finished reply once the committed transcript shows it. */
function releaseHeldStream(
  stream: SessionState["stream"],
  messages: AgentMessage[],
): SessionState["stream"] {
  if (stream.active || !stream.held || !stream.message) return stream;
  const timestamp = stream.message.timestamp;
  const committed = timestamp === undefined
    || messages.some((message) => message.role === "assistant" && message.timestamp === timestamp);
  return committed ? { active: false, message: null, held: false } : stream;
}

/** Deterministic id: the reducer stays a pure function of state and input. */
function noticeFor(state: SessionState, type: Notice["type"], message: string, at: number): Notice {
  return { id: `${type}:${at}:${state.notices.length}`, type, message, at };
}

function pushNotice(state: SessionState, notice: Notice): SessionState {
  const notices = [...state.notices, notice];
  return { ...state, notices: notices.slice(Math.max(0, notices.length - MAX_NOTICES)) };
}

function isNoticeType(value: string): value is Notice["type"] {
  return value === "info" || value === "success" || value === "warning" || value === "error";
}
