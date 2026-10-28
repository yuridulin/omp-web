import type { AgentMessage, AssistantMessage, ToolResultMessage, UserMessage } from "./types";

/**
 * Framework-free session model.
 *
 * Nothing here knows about React, the DOM, fetch, or storage. The reducer is a
 * pure transition function over wire frames and user intents; the machine (see
 * ./machine) supplies the outside world through ports.
 */

export type ConnectionStatus = "idle" | "connecting" | "open" | "reconnecting" | "closed";

export type NoticeType = "info" | "success" | "warning" | "error";

export interface Notice {
  id: string;
  type: NoticeType;
  message: string;
  /** Clock time the notice was raised; the presenter decides its lifetime. */
  at: number;
}

export interface QueueSnapshot {
  steering: string[];
  followUp: string[];
}

export interface QueueState extends QueueSnapshot {
  /** Bumps on every accepted snapshot so late answers can be rejected. */
  revision: number;
}

/** Which branch of the session tree the reader is looking at. */
export interface SessionView {
  leafId: string | null;
  includePreCompaction: boolean;
}

export interface RunState {
  status: "idle" | "running";
  /** Monotonic id of the current or last run, for stale-response rejection. */
  id: number;
  /** Whether this run produced visible assistant output. */
  hadContent: boolean;
  error: string | null;
}

export interface StreamState {
  active: boolean;
  message: Partial<AssistantMessage> | null;
  /**
   * A finished reply stays on screen until the committed transcript contains
   * it; dropping it first makes the chat jump. `release` clears it.
   */
  held: boolean;
}

export interface SessionState {
  sessionId: string | null;
  connection: ConnectionStatus;
  /** Identity of the live event stream; a new one invalidates all sequencing. */
  streamId: string | null;
  /** Last applied `web.sequence` for `streamId`. */
  sequence: number;
  run: RunState;
  view: SessionView;
  /** Committed transcript, as last read from the session store. */
  messages: AgentMessage[];
  entryIds: string[];
  /** The prompt the user just sent, shown until history echoes it. */
  optimistic: UserMessage | null;
  stream: StreamState;
  queue: QueueState;
  /** Live partial tool results (tool_execution_start/update), keyed by call id. */
  toolResults: Record<string, ToolResultMessage>;
  notices: Notice[];
  /**
   * Bumps whenever the committed transcript must be re-read: a run ended
   * without visible output, the session moved on disk, or a stream restarted.
   */
  historyRevision: number;
  lastError: string | null;
}

export const MAX_NOTICES = 5;
export const EMPTY_QUEUE: QueueState = { steering: [], followUp: [], revision: 0 };

export function initialState(sessionId: string | null = null): SessionState {
  return {
    sessionId,
    connection: "idle",
    streamId: null,
    sequence: 0,
    run: { status: "idle", id: 0, hadContent: false, error: null },
    view: { leafId: null, includePreCompaction: false },
    messages: [],
    entryIds: [],
    optimistic: null,
    stream: { active: false, message: null, held: false },
    queue: EMPTY_QUEUE,
    toolResults: {},
    notices: [],
    historyRevision: 0,
    lastError: null,
  };
}

/** Messages the transcript shows: committed history plus the pending prompt. */
export function visibleMessages(state: SessionState): AgentMessage[] {
  return state.optimistic ? [...state.messages, state.optimistic] : state.messages;
}

/** Text a user message carries, regardless of content blocks. */
export function userMessageText(message: UserMessage): string {
  if (typeof message.content === "string") return message.content;
  return message.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
}

/** Whether an assistant payload has anything a reader would see. */
export function hasVisibleAssistantContent(message: Partial<AssistantMessage> | null): boolean {
  if (!message || !Array.isArray(message.content)) return false;
  return message.content.some((block) => {
    if (block.type === "image") return true;
    if (block.type === "text") return typeof block.text === "string" && block.text.trim().length > 0;
    return false;
  });
}
