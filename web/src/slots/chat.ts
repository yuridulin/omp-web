import type { ModelEntry } from "@/api/agent";
import type { SessionSnapshot } from "@/api/session-types";
import type { SessionContextPayload, SessionSummary } from "@/api/workspace";
import type { DragPayload } from "@/drag/payload";
import type { ExtensionRequest, ExtensionResponse } from "@/state/extension-store";

export type ComposerSubmitMode = "send" | "steer" | "followUp";

export interface ChatSlotProps {
  session: SessionSummary | null;
  selected: string | null;
  snapshot: SessionSnapshot | null;
  context: SessionContextPayload | undefined;
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
  onSend: (text: string, mode: ComposerSubmitMode) => Promise<void>;
  onAbort: () => void;
  onRemoveQueued: (queue: "steering" | "followUp", text: string) => void;
  onPromoteQueued: (text: string) => void;
  /** A drop gesture decoded at the skin boundary. */
  onDropPayload: (payload: DragPayload) => void;
}
