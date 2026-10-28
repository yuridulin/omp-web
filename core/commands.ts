import type { DraftFile, DraftImage } from "./drafts";
import type { AgentCommand } from "./ports";

/**
 * The semantic surface of the chat.
 *
 * One union of user intents, expressed in domain terms (prompt, steer, fork,
 * draft) rather than in frames or widgets. Every front end — React, Lit, a TUI,
 * a test — drives the same intents, and `toFrame` is the single place that knows
 * how a hosted omp runtime is asked to do them.
 */

export type QueueKind = "steering" | "followUp";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "auto";

export type StreamingMode = "steer" | "followUp";

export interface DraftPatch {
  text?: string;
  images?: readonly DraftImage[];
  files?: readonly DraftFile[];
}

export type ChatIntent =
  /* Prompting */
  | { kind: "prompt"; text: string; images?: readonly unknown[] }
  | { kind: "steer"; text: string }
  | { kind: "follow-up"; text: string }
  /* Run control */
  | { kind: "abort" }
  | { kind: "abort-compaction" }
  | { kind: "compact"; instructions?: string }
  /* Queue (omp owns the queue; these two ask it to change its own snapshot) */
  | { kind: "queue-remove"; queue: QueueKind; text: string }
  | { kind: "queue-promote"; text: string }
  /* History and branching */
  | { kind: "edit-entry"; entryId: string; text: string }
  | { kind: "fork-entry"; entryId: string; withEdits: boolean }
  | { kind: "navigate-leaf"; leafId: string | null }
  | { kind: "toggle-pre-compaction" }
  /* Model and run preferences */
  | { kind: "select-model"; provider: string; modelId: string }
  | { kind: "set-thinking"; level: ThinkingLevel }
  | { kind: "set-fast-mode"; enabled: boolean }
  | { kind: "set-slow-mode"; enabled: boolean }
  | { kind: "set-auto-compaction"; enabled: boolean }
  | { kind: "set-interrupt-mode"; mode: "immediate" | "wait" }
  | { kind: "set-streaming-mode"; mode: StreamingMode }
  /* Session metadata */
  | { kind: "set-session-name"; name: string }
  /* Extension surfaces */
  | { kind: "extension-response"; requestId: string; response: Record<string, unknown> }
  /* Presentation state the engine still owns (it decides what a draft is) */
  | { kind: "draft-edit"; patch: DraftPatch }
  | { kind: "draft-clear" }
  /* Explicit refresh of the runtime snapshot */
  | { kind: "refresh-state" };

/**
 * Intents the client fulfils locally: they change what the reader sees, not what
 * the runtime does.
 */
const LOCAL_INTENTS: Partial<Record<ChatIntent["kind"], true>> = {
  "navigate-leaf": true,
  "toggle-pre-compaction": true,
  "draft-edit": true,
  "draft-clear": true,
};

export function isLocalIntent(intent: ChatIntent): boolean {
  return LOCAL_INTENTS[intent.kind] === true;
}

/** Translate an intent into the frame a hosted omp runtime understands. */
export function toFrame(intent: ChatIntent): AgentCommand | null {
  switch (intent.kind) {
    case "prompt":
      return {
        type: "prompt",
        message: intent.text,
        ...(intent.images && intent.images.length ? { images: intent.images } : {}),
      };
    case "steer":
      return { type: "steer", message: intent.text, streamingBehavior: "steer" };
    case "follow-up":
      return { type: "follow_up", message: intent.text };
    case "abort":
      return { type: "abort" };
    case "abort-compaction":
      return { type: "abort_compaction" };
    case "compact":
      return { type: "compact", ...(intent.instructions ? { instructions: intent.instructions } : {}) };
    case "queue-remove":
      return { type: "remove_queued_message", queue: intent.queue, message: intent.text };
    case "queue-promote":
      return { type: "promote_queued_message", message: intent.text };
    case "edit-entry":
      return { type: "edit_message", entryId: intent.entryId, message: intent.text };
    case "fork-entry":
      return { type: "fork", entryId: intent.entryId, editsPrompt: intent.withEdits };
    case "select-model":
      return { type: "set_model", provider: intent.provider, modelId: intent.modelId };
    case "set-thinking":
      return { type: "set_thinking_level", level: intent.level };
    case "set-fast-mode":
      return { type: "set_fast_mode", enabled: intent.enabled };
    case "set-slow-mode":
      return { type: "set_slow_mode", enabled: intent.enabled };
    case "set-auto-compaction":
      return { type: "set_auto_compaction", enabled: intent.enabled };
    case "set-interrupt-mode":
      return { type: "set_interrupt_mode", mode: intent.mode };
    case "set-streaming-mode":
      return { type: "set_streaming_mode", mode: intent.mode };
    case "set-session-name":
      return { type: "set_session_name", name: intent.name };
    case "extension-response":
      return { type: "extension_ui_response", id: intent.requestId, ...intent.response };
    case "refresh-state":
      return { type: "get_state" };
    case "navigate-leaf":
    case "toggle-pre-compaction":
    case "draft-edit":
    case "draft-clear":
      return null;
    default:
      return assertNever(intent);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled intent: ${JSON.stringify(value)}`);
}
