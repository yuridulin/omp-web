import type { AssistantMessage, ToolResultMessage } from "@/lib/types";
import { isRecord } from "./guards";
import type { QueueSnapshot } from "./state";

/**
 * Wire shapes and parsers for the RPC frame stream.
 *
 * Frames arrive from omp (`--mode rpc-ui`) through the web transport as JSON.
 * Every parser is total: an unrecognised shape yields null instead of throwing,
 * so a newer omp cannot crash an older client.
 */

export interface FrameCursor {
  streamId: string | null;
  sequence: number | null;
}

export interface WireEvent {
  type: string;
  web?: FrameCursor & { [key: string]: unknown };
  [key: string]: unknown;
}

/** Cursor carried by a live frame; null when the frame has no ordering info. */
export function readCursor(event: WireEvent): FrameCursor | null {
  const web = event.web;
  if (!isRecord(web)) return null;
  return {
    streamId: typeof web.streamId === "string" ? web.streamId : null,
    sequence: typeof web.sequence === "number" && Number.isFinite(web.sequence) ? web.sequence : null,
  };
}

/** omp's queue snapshot (`get_state.queuedMessages`, `queue_update`). */
export function readQueueSnapshot(value: unknown): QueueSnapshot | null {
  if (!isRecord(value) || !Array.isArray(value.steering) || !Array.isArray(value.followUp)) return null;
  const strings = (list: unknown[]) => list.filter((item): item is string => typeof item === "string");
  return { steering: strings(value.steering), followUp: strings(value.followUp) };
}

/** A streaming assistant payload; null when the frame carries nothing usable. */
export function readAssistantPayload(value: unknown): Partial<AssistantMessage> | null {
  if (!isRecord(value)) return null;
  if (value.role !== undefined && value.role !== "assistant") return null;
  const message: Partial<AssistantMessage> = { ...(value as Partial<AssistantMessage>) };
  if (message.content !== undefined && !Array.isArray(message.content)) delete message.content;
  return message;
}

/** A live tool result from a start/update frame, keyed by the call it belongs to. */
export function readToolResult(
  value: unknown,
  toolCallId: string | null,
): ToolResultMessage | null {
  if (!isRecord(value) || !toolCallId) return null;
  return {
    role: "toolResult",
    toolCallId,
    toolName: typeof value.toolName === "string" ? value.toolName : undefined,
    content: Array.isArray(value.content) ? (value.content as ToolResultMessage["content"]) : [],
    partial: true,
    timestamp: typeof value.timestamp === "number" ? value.timestamp : undefined,
  };
}

/** Error text a frame carries, if any. */
export function readErrorMessage(event: WireEvent): string | null {
  for (const candidate of [event.message, event.error, event.errorMessage, event.reason]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

/** True when an `agent_end` frame is terminal (an async delivery may resume the run). */
export function isTerminalAgentEnd(event: WireEvent): boolean {
  return event.isTerminal !== false;
}

/** Error stamped on the final assistant message of a failed run. */
export function readTerminalAgentError(event: WireEvent): string | null {
  const message = readAssistantPayload(event.message);
  const text = message?.errorMessage;
  return typeof text === "string" && text.trim() ? text.trim() : null;
}
