import { useEffect, useMemo, useState } from "react";
import {
  dispatchIntent,
  type ChatIntentBody,
  type IntentDispatchResult,
  type ModelCatalog,
  type ModelEntry,
} from "@/api/agent";
import type { DragPayload } from "@/drag/payload";
import { useModels } from "@/features/sessions/use-models";
import { useSessionModel } from "@/features/sessions/use-session-model";
import { skinFor } from "@/skins/registry";
import type { ComposerSubmitMode } from "@/slots/chat";
import { appendComposerDraft } from "@/state/composer-store";
import { useHistoryWindow, loadOlderHistory } from "@/state/history-window";
import {
  clearExtensionRequest,
  useExtensionRequest,
  type ExtensionResponse,
} from "@/state/extension-store";
import { useSessionStream, useSubagentsStream } from "@/state/event-stream";
import { useListedSession } from "@/state/session-catalog";
import type { SessionSummary } from "@/api/workspace";
import { bumpStreamGeneration, useStreamGeneration } from "@/state/stream-generation";
import { useAppearance } from "@/state/use-appearance";
import { useSessionSnapshot } from "@/state/use-session-snapshot";

const EMPTY_MODELS: ModelEntry[] = [];
const EMPTY_QUEUE: { steering: string[]; followUp: string[] } = { steering: [], followUp: [] };
const FALLBACK_THINKING_LEVELS = ["off", "auto"];
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max", "auto"] as const;

type ThinkingLevel = (typeof THINKING_LEVELS)[number];

function asThinkingLevel(level: string): ThinkingLevel {
  return (THINKING_LEVELS as readonly string[]).includes(level) ? (level as ThinkingLevel) : "off";
}

function thinkingLevelsFor(
  models: ModelCatalog | undefined,
  provider: string | null,
  modelId: string | null,
): string[] {
  if (!models || provider === null || modelId === null) return FALLBACK_THINKING_LEVELS;
  const entry = models.modelList.find((item) => item.provider === provider && item.id === modelId);
  const fromEntry = entry?.thinkingLevels;
  if (fromEntry !== undefined && fromEntry.length > 0) return fromEntry;
  const fromCatalog = models.thinkingLevels[`${provider}:${modelId}`];
  if (fromCatalog !== undefined && fromCatalog.length > 0) return fromCatalog;
  return FALLBACK_THINKING_LEVELS;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

async function runIntent(sessionId: string, intent: ChatIntentBody): Promise<IntentDispatchResult> {
  const result = await dispatchIntent(sessionId, intent);
  if (result.bootstrapped) bumpStreamGeneration();
  return result;
}

interface ChatColumnProps {
  selected: string | null;
  /** Shown until the session list includes the id just created. */
  pendingSession: SessionSummary | null;
  /** First-prompt failure, owned by the shell that created the session. */
  externalError: string | null;
  /** True while that first prompt is still in flight. */
  externalSending: boolean;
}

export function ChatColumn({ selected, pendingSession, externalError, externalSending }: ChatColumnProps) {
  const appearance = useAppearance();
  const listed = useListedSession(selected);
  const session = listed ?? pendingSession;
  const snapshot = useSessionSnapshot(selected);
  const history = useHistoryWindow(
    selected,
    snapshot?.session.historyRevision ?? null,
    snapshot?.session.run.status ?? null,
  );
  const streamGeneration = useStreamGeneration();
  const { error: streamError } = useSessionStream(selected, streamGeneration);
  // One subscription per open session: the running strip above the composer and
  // the agents view read the same roster store, so neither owns the channel.
  useSubagentsStream(selected, streamGeneration);
  const extensionRequest = useExtensionRequest(selected);
  const extensionRequestId = extensionRequest?.id ?? null;
  const [extensionBusy, setExtensionBusy] = useState(false);
  const [extensionError, setExtensionError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const modelsQuery = useModels();
  const models = modelsQuery.data;
  const modelFallback = useMemo(() => {
    if (history.model === null && history.thinkingLevel === null) return null;
    return { model: history.model, thinkingLevel: history.thinkingLevel };
  }, [history.model, history.thinkingLevel]);
  const sessionModel = useSessionModel(selected, modelFallback);
  const liveModel = sessionModel.value;
  const modelValue = liveModel ? { provider: liveModel.provider, modelId: liveModel.modelId } : null;
  const thinkingLevel = liveModel?.thinkingLevel ?? "off";
  const thinkingLevels = useMemo(
    () => thinkingLevelsFor(models, liveModel?.provider ?? null, liveModel?.modelId ?? null),
    [models, liveModel?.provider, liveModel?.modelId],
  );
  useEffect(() => {
    setExtensionError(null);
  }, [extensionRequestId]);
  const ChatSkin = skinFor("chat", appearance);
  const agentRunning = snapshot?.session.run.status === "running";

  const handleExtensionResponse = async (response: ExtensionResponse): Promise<void> => {
    if (!selected || !extensionRequest) return;
    const sessionId = selected;
    const requestId = extensionRequest.id;
    setExtensionBusy(true);
    setExtensionError(null);
    try {
      await runIntent(sessionId, { kind: "extension-response", requestId, response });
      clearExtensionRequest(sessionId, requestId);
    } catch (cause) {
      setExtensionError(errorMessage(cause));
    } finally {
      setExtensionBusy(false);
    }
  };

  const handleSend = async (text: string, mode: ComposerSubmitMode): Promise<void> => {
    if (!selected) return;
    setSending(true);
    setSendError(null);
    try {
      const intent: ChatIntentBody =
        mode === "send"
          ? { kind: "prompt", text }
          : mode === "steer"
            ? { kind: "steer", text }
            : { kind: "follow-up", text };
      await runIntent(selected, intent);
    } catch (cause) {
      setSendError(errorMessage(cause));
      throw cause;
    } finally {
      setSending(false);
    }
  };

  return (
    <ChatSkin
      session={session}
      selected={selected}
      snapshot={snapshot}
      historyMessages={history.messages}
      historyEntryIds={history.entryIds}
      hasOlderHistory={history.hasOlder}
      historyOlderEpoch={history.olderEpoch}
      onLoadOlderHistory={() => {
        if (selected) void loadOlderHistory(selected);
      }}
      streamError={streamError ?? sendError ?? externalError}
      extensionRequest={extensionRequest}
      extensionBusy={extensionBusy}
      extensionError={extensionError}
      onExtensionResponse={(response) => {
        void handleExtensionResponse(response);
      }}
      models={models?.modelList ?? EMPTY_MODELS}
      modelsLoading={modelsQuery.isLoading}
      modelValue={modelValue}
      thinkingLevel={thinkingLevel}
      thinkingLevels={thinkingLevels}
      modelLoading={sessionModel.loading}
      onModelChange={(provider, modelId) => {
        if (!selected) return;
        setSendError(null);
        void runIntent(selected, { kind: "select-model", provider, modelId })
          .then(() => sessionModel.refetch())
          .catch((cause: unknown) => setSendError(errorMessage(cause)));
      }}
      onThinkingChange={(level) => {
        if (!selected) return;
        setSendError(null);
        void runIntent(selected, { kind: "set-thinking", level: asThinkingLevel(level) })
          .then(() => sessionModel.refetch())
          .catch((cause: unknown) => setSendError(errorMessage(cause)));
      }}
      running={agentRunning}
      queue={snapshot?.session.queue ?? EMPTY_QUEUE}
      sending={sending || externalSending}
      onSend={handleSend}
      onAbort={() => {
        if (!selected) return;
        void runIntent(selected, { kind: "abort" }).catch((cause: unknown) => setSendError(errorMessage(cause)));
      }}
      onRemoveQueued={(queue, text) => {
        if (!selected) return;
        void runIntent(selected, { kind: "queue-remove", queue, text }).catch((cause: unknown) =>
          setSendError(errorMessage(cause)),
        );
      }}
      onPromoteQueued={(text) => {
        if (!selected) return;
        void runIntent(selected, { kind: "queue-promote", text }).catch((cause: unknown) =>
          setSendError(errorMessage(cause)),
        );
      }}
      onDropPayload={(payload: DragPayload) => {
        if (!selected || payload.kind !== "file") return;
        appendComposerDraft(selected, payload.path);
      }}
    />
  );
}
