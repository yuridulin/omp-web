import type { ModelEntry } from "@/api/agent";
import type { ChatMessage, SessionSnapshot } from "@/api/session-types";
import type { SessionSummary } from "@/api/workspace";
import type { DragPayload } from "@/drag/payload";
import type { ExtensionRequest, ExtensionResponse } from "@/state/extension-store";
import type { ComposerImage } from "@/state/composer-store";

export type ComposerSubmitMode = "send" | "steer" | "followUp";

export interface ChatSlotProps {
  session: SessionSummary | null;
  selected: string | null;
  snapshot: SessionSnapshot | null;
  /** Transcript window. Older pages are not included until `onLoadOlderHistory`. */
  historyMessages: ChatMessage[];
  historyEntryIds: string[];
  hasOlderHistory: boolean;
  historyOlderEpoch: number;
  onLoadOlderHistory: () => void;
  streamError: string | null;
  extensionRequest: ExtensionRequest | null;
  extensionBusy: boolean;
  extensionError: string | null;
  onExtensionResponse: (response: ExtensionResponse) => void | Promise<void>;
  models: ModelEntry[];
  modelsLoading: boolean;
  modelValue: { provider: string; modelId: string } | null;
  thinkingLevel: string;
  thinkingLevels: string[];
  modelLoading: boolean;
  onModelChange: (provider: string, modelId: string) => void;
  onThinkingChange: (level: string) => void;
  running: boolean;
  queue: { steering: string[]; followUp: string[] };
  sending: boolean;
  onSend: (
    text: string,
    mode: ComposerSubmitMode,
    images: readonly ComposerImage[],
  ) => Promise<void>;
  onAbort: () => void;
  onRemoveQueued: (queue: "steering" | "followUp", text: string) => void;
  onPromoteQueued: (text: string) => void;
  /** A drop gesture decoded at the skin boundary. */
  onDropPayload: (payload: DragPayload) => void;
}
