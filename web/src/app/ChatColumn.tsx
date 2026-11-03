import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createSession,
  dispatchIntent,
  fetchDefaultCwd,
  validateCwd,
  type ChatIntentBody,
  type IntentDispatchResult,
  type ModelCatalog,
  type ModelEntry,
} from "@/api/agent";
import type { DragPayload } from "@/drag/payload";
import { useProjects } from "@/features/projects/use-projects";
import { useModels } from "@/features/sessions/use-models";
import { useSessionModel } from "@/features/sessions/use-session-model";
import { skinFor } from "@/skins/registry";
import type { ComposerSubmitMode } from "@/slots/chat";
import { appendComposerDraft, NEW_SESSION_DRAFT_ID, type ComposerImage } from "@/state/composer-store";
import { toPromptImages } from "@/features/chat/image-attachments";
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
  /** Workspace seeded by the rail or the last session when starting a new one. */
  newSessionCwd: string | null;
  /** Bumps for every explicit new-session request so the draft state resets. */
  newSessionEpoch: number;
  /** Effective workspace of the unsaved chat, reported so the shell can paint it. */
  onDraftCwdChange: (cwd: string) => void;
  /** A first prompt created this session; the shell selects it. */
  onSessionCreated: (id: string, cwd: string) => void;
}

export function ChatColumn({
  selected,
  pendingSession,
  newSessionCwd,
  newSessionEpoch,
  onDraftCwdChange,
  onSessionCreated,
}: ChatColumnProps) {
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
  const [draftCwd, setDraftCwd] = useState(newSessionCwd ?? "");
  const [draftCwdError, setDraftCwdError] = useState<string | null>(null);
  const [draftModel, setDraftModel] = useState<{ provider: string; modelId: string } | null>(null);
  const [draftThinking, setDraftThinking] = useState("auto");
  const draftEpoch = useRef(newSessionEpoch);
  const projectsQuery = useProjects();
  const modelsQuery = useModels();
  const models = modelsQuery.data;
  const modelFallback = useMemo(() => {
    if (history.model === null && history.thinkingLevel === null) return null;
    return { model: history.model, thinkingLevel: history.thinkingLevel };
  }, [history.model, history.thinkingLevel]);
  const sessionModel = useSessionModel(selected, modelFallback);
  const liveModel = sessionModel.value;
  const isDraft = selected === null;
  const draftModelValue = draftModel ?? models?.defaultModel ?? null;
  const liveThinkingLevels = useMemo(
    () => thinkingLevelsFor(models, liveModel?.provider ?? null, liveModel?.modelId ?? null),
    [models, liveModel?.provider, liveModel?.modelId],
  );
  const draftThinkingLevels = useMemo(
    () =>
      thinkingLevelsFor(
        models,
        draftModelValue?.provider ?? null,
        draftModelValue?.modelId ?? null,
      ),
    [models, draftModelValue?.provider, draftModelValue?.modelId],
  );
  const activeModel = isDraft ? draftModelValue : liveModel;
  const modelValue = activeModel
    ? { provider: activeModel.provider, modelId: activeModel.modelId }
    : null;
  const thinkingLevel = isDraft ? draftThinking : (liveModel?.thinkingLevel ?? "off");
  const thinkingLevels = isDraft ? draftThinkingLevels : liveThinkingLevels;

  const draftSummary = useMemo<SessionSummary | null>(() => {
    if (!isDraft || draftCwd.trim() === "") return null;
    const now = new Date().toISOString();
    return {
      path: "",
      id: NEW_SESSION_DRAFT_ID,
      cwd: draftCwd,
      name: "New session",
      created: now,
      modified: now,
      messageCount: 0,
      firstMessage: "",
      projectRoot: draftCwd,
    };
  }, [isDraft, draftCwd]);

  const applyDraftCwd = useCallback((cwd: string) => {
    setDraftCwd(cwd);
    onDraftCwdChange(cwd);
  }, [onDraftCwdChange]);

  // A draft starts in the first project the rail lists, so a new session is
  // never created in the synthetic home directory while real projects exist.
  const resolveDraftCwd = useCallback(async (): Promise<string> => {
    setDraftCwdError(null);
    const path = projectsQuery.data?.[0]?.path ?? await fetchDefaultCwd();
    applyDraftCwd(path);
    return path;
  }, [projectsQuery.data, applyDraftCwd]);

  // The rail and workbench paint the draft from the shell, so keep the shell's
  // copy in step with the cwd this column resolved or validated. Declared before
  // the epoch reset so a new draft's seed wins when both run in one commit.
  useEffect(() => {
    if (selected === null) onDraftCwdChange(draftCwd);
  }, [selected, draftCwd, onDraftCwdChange]);

  useEffect(() => {
    if (draftEpoch.current === newSessionEpoch) return;
    draftEpoch.current = newSessionEpoch;
    applyDraftCwd(newSessionCwd ?? "");
    setDraftCwdError(null);
    setDraftModel(null);
    setDraftThinking("auto");
  }, [newSessionEpoch, newSessionCwd, applyDraftCwd]);

  useEffect(() => {
    if (selected !== null || draftCwd.trim() !== "" || projectsQuery.isPending) return;
    resolveDraftCwd().catch((cause: unknown) => setDraftCwdError(errorMessage(cause)));
  }, [selected, draftCwd, projectsQuery.isPending, resolveDraftCwd]);

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

  const handleSend = async (
    text: string,
    mode: ComposerSubmitMode,
    images: readonly ComposerImage[],
  ): Promise<void> => {
    setSending(true);
    setSendError(null);
    const attachments = toPromptImages(images);
    const withImages = attachments.length > 0 ? { images: attachments } : {};
    try {
      if (selected === null) {
        let target = draftCwd.trim();
        if (target === "") {
          target = await resolveDraftCwd();
        }
        const validated = await validateCwd(target);
        applyDraftCwd(validated.cwd);
        const created = await createSession({
          cwd: validated.cwd,
          ...(draftModel !== null
            ? { provider: draftModel.provider, modelId: draftModel.modelId }
            : {}),
          ...(draftThinking !== "auto" ? { thinkingLevel: draftThinking } : {}),
        });
        onSessionCreated(created, validated.cwd);
        await runIntent(created, { kind: "prompt", text, ...withImages });
        return;
      }
      const intent: ChatIntentBody =
        mode === "send"
          ? { kind: "prompt", text, ...withImages }
          : mode === "steer"
            ? { kind: "steer", text, ...withImages }
            : { kind: "follow-up", text, ...withImages };
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
      session={session ?? draftSummary}
      selected={selected}
      snapshot={snapshot}
      historyMessages={history.messages}
      historyEntryIds={history.entryIds}
      hasOlderHistory={history.hasOlder}
      historyOlderEpoch={history.olderEpoch}
      onLoadOlderHistory={() => {
        if (selected) void loadOlderHistory(selected);
      }}
      streamError={streamError ?? sendError ?? (isDraft ? draftCwdError : null)}
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
      modelLoading={isDraft ? false : sessionModel.loading}
      onModelChange={(provider, modelId) => {
        setSendError(null);
        if (selected === null) {
          setDraftModel({ provider, modelId });
          setDraftThinking("auto");
          return;
        }
        void runIntent(selected, { kind: "select-model", provider, modelId })
          .then(() => sessionModel.refetch())
          .catch((cause: unknown) => setSendError(errorMessage(cause)));
      }}
      onThinkingChange={(level) => {
        setSendError(null);
        if (selected === null) {
          setDraftThinking(level);
          return;
        }
        void runIntent(selected, { kind: "set-thinking", level: asThinkingLevel(level) })
          .then(() => sessionModel.refetch())
          .catch((cause: unknown) => setSendError(errorMessage(cause)));
      }}
      running={isDraft ? false : agentRunning}
      queue={snapshot?.session.queue ?? EMPTY_QUEUE}
      sending={sending}
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
        if (payload.kind !== "file") return;
        appendComposerDraft(selected ?? NEW_SESSION_DRAFT_ID, payload.path);
      }}
    />
  );
}
