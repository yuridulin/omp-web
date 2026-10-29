import type { DraftFile, DraftImage } from "./drafts";
import { isRecord } from "./guards";
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

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max", "auto"] as const;
const QUEUE_KINDS = ["steering", "followUp"] as const;
const INTERRUPT_MODES = ["immediate", "wait"] as const;
const STREAMING_MODES = ["steer", "followUp"] as const;

function stringField(value: Record<string, unknown>, key: string): string | null {
  return typeof value[key] === "string" ? value[key] : null;
}

function booleanField(value: Record<string, unknown>, key: string): boolean | null {
  return typeof value[key] === "boolean" ? value[key] : null;
}

function readImages(value: unknown): DraftImage[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const images: DraftImage[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.data !== "string" || typeof item.mimeType !== "string") return null;
    images.push({ data: item.data, mimeType: item.mimeType });
  }
  return images;
}

function readFiles(value: unknown): DraftFile[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const files: DraftFile[] = [];
  for (const item of value) {
    if (
      !isRecord(item)
      || typeof item.name !== "string"
      || typeof item.mimeType !== "string"
      || typeof item.content !== "string"
      || typeof item.size !== "number"
    ) return null;
    files.push({ name: item.name, mimeType: item.mimeType, content: item.content, size: item.size });
  }
  return files;
}

/**
 * Total parser for the client intent boundary. Anything the union cannot
 * represent — unknown kind, wrong field type, extra structural damage — yields
 * null instead of a frame with missing parts.
 */
export function parseChatIntent(value: unknown): ChatIntent | null {
  if (!isRecord(value) || typeof value.kind !== "string") return null;
  switch (value.kind) {
    case "prompt": {
      const text = stringField(value, "text");
      if (text === null) return null;
      if (value.images === undefined) return { kind: "prompt", text };
      if (!Array.isArray(value.images)) return null;
      return { kind: "prompt", text, images: value.images };
    }
    case "steer": {
      const text = stringField(value, "text");
      return text === null ? null : { kind: "steer", text };
    }
    case "follow-up": {
      const text = stringField(value, "text");
      return text === null ? null : { kind: "follow-up", text };
    }
    case "abort":
      return { kind: "abort" };
    case "abort-compaction":
      return { kind: "abort-compaction" };
    case "compact":
      if (value.instructions === undefined) return { kind: "compact" };
      return typeof value.instructions === "string"
        ? { kind: "compact", instructions: value.instructions }
        : null;
    case "queue-remove": {
      const queue = value.queue;
      const text = stringField(value, "text");
      if (text === null || !QUEUE_KINDS.includes(queue as (typeof QUEUE_KINDS)[number])) return null;
      return { kind: "queue-remove", queue: queue as QueueKind, text };
    }
    case "queue-promote": {
      const text = stringField(value, "text");
      return text === null ? null : { kind: "queue-promote", text };
    }
    case "edit-entry": {
      const entryId = stringField(value, "entryId");
      const text = stringField(value, "text");
      return entryId === null || text === null ? null : { kind: "edit-entry", entryId, text };
    }
    case "fork-entry": {
      const entryId = stringField(value, "entryId");
      const withEdits = booleanField(value, "withEdits");
      return entryId === null || withEdits === null ? null : { kind: "fork-entry", entryId, withEdits };
    }
    case "navigate-leaf": {
      const leafId = value.leafId;
      if (leafId !== null && typeof leafId !== "string") return null;
      return { kind: "navigate-leaf", leafId };
    }
    case "toggle-pre-compaction":
      return { kind: "toggle-pre-compaction" };
    case "select-model": {
      const provider = stringField(value, "provider");
      const modelId = stringField(value, "modelId");
      return provider === null || modelId === null ? null : { kind: "select-model", provider, modelId };
    }
    case "set-thinking": {
      const level = value.level;
      return THINKING_LEVELS.includes(level as ThinkingLevel)
        ? { kind: "set-thinking", level: level as ThinkingLevel }
        : null;
    }
    case "set-fast-mode":
    case "set-slow-mode":
    case "set-auto-compaction": {
      const enabled = booleanField(value, "enabled");
      if (enabled === null) return null;
      if (value.kind === "set-fast-mode") return { kind: "set-fast-mode", enabled };
      if (value.kind === "set-slow-mode") return { kind: "set-slow-mode", enabled };
      return { kind: "set-auto-compaction", enabled };
    }
    case "set-interrupt-mode": {
      const mode = value.mode;
      return INTERRUPT_MODES.includes(mode as (typeof INTERRUPT_MODES)[number])
        ? { kind: "set-interrupt-mode", mode: mode as (typeof INTERRUPT_MODES)[number] }
        : null;
    }
    case "set-streaming-mode": {
      const mode = value.mode;
      return STREAMING_MODES.includes(mode as (typeof STREAMING_MODES)[number])
        ? { kind: "set-streaming-mode", mode: mode as StreamingMode }
        : null;
    }
    case "set-session-name": {
      const name = stringField(value, "name");
      return name === null ? null : { kind: "set-session-name", name };
    }
    case "extension-response": {
      const requestId = stringField(value, "requestId");
      if (requestId === null || !isRecord(value.response)) return null;
      return { kind: "extension-response", requestId, response: value.response };
    }
    case "draft-edit": {
      if (!isRecord(value.patch)) return null;
      const patch: DraftPatch = {};
      if (value.patch.text !== undefined) {
        if (typeof value.patch.text !== "string") return null;
        patch.text = value.patch.text;
      }
      const images = readImages(value.patch.images);
      const files = readFiles(value.patch.files);
      if (images === null || files === null) return null;
      if (value.patch.images !== undefined) patch.images = images;
      if (value.patch.files !== undefined) patch.files = files;
      return { kind: "draft-edit", patch };
    }
    case "draft-clear":
      return { kind: "draft-clear" };
    case "refresh-state":
      return { kind: "refresh-state" };
    default:
      return null;
  }
}
