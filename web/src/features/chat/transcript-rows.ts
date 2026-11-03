import { isRecord } from "@/api/guards";
import type { ChatMessage } from "@/api/session-types";
import { contentBlocks } from "./transcript";

/**
 * Transcript row decisions: which messages get a row, which tool results are
 * already painted inside a tool call, and how much of the tail is rendered
 * eagerly. Pure functions so a skin only decides layout.
 */

/** Rows at the bottom stay fully rendered so the live tail does not jump. */
export const EAGER_TAIL = 12;

/** Visible text of a user turn, whether content is a string or text blocks. */
export function userTurnText(message: ChatMessage): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => isRecord(block) && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n");
}

/**
 * History window plus the optimistic prompt the server has not echoed yet.
 * The history file can already contain the prompt while the live snapshot
 * still holds the optimistic copy, so a matching user turn is not painted twice.
 */
export function withOptimistic(
  messages: readonly ChatMessage[],
  optimistic: ChatMessage | null | undefined,
): ChatMessage[] {
  if (!optimistic) return [...messages];
  const pending = userTurnText(optimistic);
  const echoed = pending.length > 0 && messages.some(
    (message) => message.role === "user" && userTurnText(message) === pending,
  );
  return echoed ? [...messages] : [...messages, optimistic];
}

/**
 * Tool results keyed by call id. History rows win over the live map; the live
 * map then fills gaps (and wins when the server supplies a newer copy of a
 * call whose result is still streaming).
 */
export function pairToolResults(
  messages: readonly ChatMessage[],
  live: Record<string, unknown> | undefined,
): Map<string, ChatMessage> {
  const results = new Map<string, ChatMessage>();
  for (const message of messages) {
    if (message.role !== "toolResult" || typeof message.toolCallId !== "string") continue;
    results.set(message.toolCallId, message);
  }
  if (live) {
    for (const [key, value] of Object.entries(live)) {
      if (!isRecord(value) || value.role !== "toolResult") continue;
      const callId = typeof value.toolCallId === "string" && value.toolCallId !== "" ? value.toolCallId : key;
      results.set(callId, value as ChatMessage);
    }
  }
  return results;
}

/** Every tool call id reachable from the given message sources. */
export function toolCallIds(messages: Iterable<ChatMessage>): Set<string> {
  const ids = new Set<string>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const block of contentBlocks(message.content)) {
      if (block.type === "toolCall" && block.toolCallId !== "") ids.add(block.toolCallId);
    }
  }
  return ids;
}

/**
 * A tool result paired with an assistant tool call is rendered inside that
 * call; only unpaired results get their own row.
 */
export function isPairedToolResult(message: ChatMessage, ids: ReadonlySet<string>): boolean {
  return (
    message.role === "toolResult" &&
    typeof message.toolCallId === "string" &&
    ids.has(message.toolCallId)
  );
}

export interface TranscriptRow {
  index: number;
  message: ChatMessage;
}

/** Rows that carry harness bookkeeping rather than conversation. */
const HIDEABLE_ROLES: Record<string, true> = { user: true, custom: true, system: true };

/**
 * `display: false` marks a server message as non-conversational. A note that
 * carried only `<system-reminder>` text is likewise empty once the reminder is
 * stripped from its blocks, and must not paint a role label with no body.
 */
export function isHiddenMessage(message: ChatMessage): boolean {
  if (message.display === false) return true;
  if (HIDEABLE_ROLES[message.role] !== true) return false;
  if (Array.isArray(message.files) && message.files.length > 0) return false;
  const blocks = contentBlocks(message.content);
  if (blocks.some((block) => block.type === "image")) return false;
  return blocks.every((block) => block.type === "text" && block.text.trim() === "");
}

/** Rows to paint, in transcript order. */
export function transcriptRows(
  messages: readonly ChatMessage[],
  ids: ReadonlySet<string>,
): TranscriptRow[] {
  const rows: TranscriptRow[] = [];
  messages.forEach((message, index) => {
    if (isHiddenMessage(message)) return;
    if (isPairedToolResult(message, ids)) return;
    rows.push({ index, message });
  });
  return rows;
}

/** First index rendered eagerly: the tail of a transcript, or 0 when short. */
export function eagerTailStart(length: number, tail = EAGER_TAIL): number {
  return length - Math.min(tail, length);
}
