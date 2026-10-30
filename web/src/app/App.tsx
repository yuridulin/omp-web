import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  createSession,
  dispatchIntent,
  type ChatIntentBody,
  type IntentDispatchResult,
  type ModelCatalog,
  type ModelEntry,
} from "@/api/agent";
import { basename, comparablePath } from "@/api/paths";
import type { SessionSummary } from "@/api/workspace";
import { useProjects } from "@/features/projects/use-projects";
import { useModels } from "@/features/sessions/use-models";
import { useSessionModel } from "@/features/sessions/use-session-model";
import { useSessions } from "@/features/sessions/use-sessions";
import { SessionRail } from "@/features/rail/SessionRail";
import { ChatPane } from "@/features/chat/ChatPane";
import { NewSessionPane, type NewSessionInputView } from "@/features/chat/NewSessionPane";
import type { ComposerSubmitMode } from "@/features/chat/Composer";
import { Workbench } from "@/features/workbench/Workbench";
import { useSessionContext } from "@/features/workbench/use-workbench-data";
import { SystemPanel } from "@/features/system/SystemPanel";
import { ensureWorkbenchRoot, updateLayout } from "@/layout/layout-store";
import { ResizeHandle } from "@/layout/ResizeHandle";
import { useLayout } from "@/layout/use-layout";
import { useRunningSessions, useSessionStream, useWorkspaceEvents } from "@/state/event-stream";
import { NotificationProvider } from "@/state/notification-center";
import {
  clearExtensionRequest,
  useExtensionRequest,
  type ExtensionResponse,
} from "@/state/extension-store";
import { useSessionSnapshot } from "@/state/use-session-snapshot";
import styles from "./app.module.css";

const EMPTY_RUNNING: string[] = [];
const EMPTY_MODELS: ModelEntry[] = [];
const EMPTY_CATALOG: ModelCatalog = { modelList: EMPTY_MODELS, defaultModel: null, thinkingLevels: {} };
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

interface PendingSession {
  id: string;
  cwd: string;
}

export function App() {
  const queryClient = useQueryClient();
  const layout = useLayout();
  const sessions = useSessions();
  const projects = useProjects();
  const modelsQuery = useModels();
  const models = modelsQuery.data;
  const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(window.location.search).get("session"));
  const [newSession, setNewSession] = useState(false);
  const [newSessionSeedCwd, setNewSessionSeedCwd] = useState<string | null>(null);
  const [pendingSession, setPendingSession] = useState<PendingSession | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [extensionBusy, setExtensionBusy] = useState(false);
  const [extensionError, setExtensionError] = useState<string | null>(null);
  const [streamRevision, setStreamRevision] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const extensionRequest = useExtensionRequest(selected);
  const extensionRequestId = extensionRequest?.id ?? null;
  // A fresh request (or a server-side cancel) must never show the previous
  // submission's failure.
  useEffect(() => {
    setExtensionError(null);
  }, [extensionRequestId]);

  const snapshot = useSessionSnapshot(selected);
  const listedSession = sessions.data?.sessions.find((item) => item.id === selected) ?? null;
  const pendingSummary = useMemo<SessionSummary | null>(() => {
    if (!pendingSession || pendingSession.id !== selected) return null;
    const now = new Date().toISOString();
    return {
      path: "",
      id: pendingSession.id,
      cwd: pendingSession.cwd,
      name: "New session",
      created: now,
      modified: now,
      messageCount: 0,
      firstMessage: "",
      projectRoot: pendingSession.cwd,
    };
  }, [pendingSession, selected]);
  const session = listedSession ?? pendingSummary;
  const root = session?.cwd ?? null;
  const projectRoot = session?.projectRoot ?? root;
  const projectLabel = useMemo(() => {
    if (!projectRoot) return "";
    const match = projects.data?.find((project) => comparablePath(project.path) === comparablePath(projectRoot));
    return match?.alias?.trim() || basename(projectRoot);
  }, [projectRoot, projects.data]);

  const context = useSessionContext(selected, !snapshot && !pendingSession);
  const modelFallback = useMemo(() => {
    const saved = context.data?.context;
    if (!saved) return null;
    return {
      model: saved.model ?? null,
      thinkingLevel: saved.thinkingLevel ?? null,
    };
  }, [context.data]);
  const sessionModel = useSessionModel(selected, modelFallback);
  const liveModel = sessionModel.value;
  const modelValue = liveModel ? { provider: liveModel.provider, modelId: liveModel.modelId } : null;
  const thinkingLevel = liveModel?.thinkingLevel ?? "off";
  const thinkingLevels = useMemo(
    () => thinkingLevelsFor(models, liveModel?.provider ?? null, liveModel?.modelId ?? null),
    [models, liveModel?.provider, liveModel?.modelId],
  );

  const fallbackRunning = sessions.data?.runningSessionIds ?? EMPTY_RUNNING;
  const running = useRunningSessions(fallbackRunning);
  const agentRunning = snapshot?.session.run.status === "running";
  const { error: streamError } = useSessionStream(selected, streamRevision);
  useWorkspaceEvents(root);

  useEffect(() => {
    if (selected && root) ensureWorkbenchRoot(selected, root);
  }, [root, selected]);

  useEffect(() => {
    if (!pendingSession) return;
    if (sessions.data?.sessions.some((item) => item.id === pendingSession.id)) {
      setPendingSession(null);
    }
  }, [pendingSession, sessions.data]);

  const runIntent = async (sessionId: string, intent: ChatIntentBody): Promise<IntentDispatchResult> => {
    const result = await dispatchIntent(sessionId, intent);
    if (result.bootstrapped) setStreamRevision((value) => value + 1);
    return result;
  };

  const handleExtensionResponse = async (response: ExtensionResponse): Promise<void> => {
    if (!selected || !extensionRequest) return;
    const sessionId = selected;
    const requestId = extensionRequest.id;
    setExtensionBusy(true);
    setExtensionError(null);
    try {
      await runIntent(sessionId, { kind: "extension-response", requestId, response });
      // Another tab may have answered first; only this id is ours to clear.
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

  const handleAbort = async (): Promise<void> => {
    if (!selected) return;
    try {
      await runIntent(selected, { kind: "abort" });
    } catch (cause) {
      setSendError(errorMessage(cause));
    }
  };

  const handleRemoveQueued = async (queue: "steering" | "followUp", text: string): Promise<void> => {
    if (!selected) return;
    try {
      await runIntent(selected, { kind: "queue-remove", queue, text });
    } catch (cause) {
      setSendError(errorMessage(cause));
    }
  };

  const handlePromoteQueued = async (text: string): Promise<void> => {
    if (!selected) return;
    try {
      await runIntent(selected, { kind: "queue-promote", text });
    } catch (cause) {
      setSendError(errorMessage(cause));
    }
  };

  const handleModelChange = async (provider: string, modelId: string): Promise<void> => {
    if (!selected) return;
    setSendError(null);
    try {
      await runIntent(selected, { kind: "select-model", provider, modelId });
      await sessionModel.refetch();
    } catch (cause) {
      setSendError(errorMessage(cause));
    }
  };

  const handleThinkingChange = async (level: string): Promise<void> => {
    if (!selected) return;
    setSendError(null);
    try {
      await runIntent(selected, { kind: "set-thinking", level: asThinkingLevel(level) });
      await sessionModel.refetch();
    } catch (cause) {
      setSendError(errorMessage(cause));
    }
  };

  const selectSession = (sessionId: string) => {
    setSelected(sessionId);
    setNewSession(false);
    setNewSessionSeedCwd(null);
    setPendingSession(null);
    setCreateError(null);
    setSendError(null);
    window.history.replaceState(null, "", `?session=${encodeURIComponent(sessionId)}`);
  };

  const openNewSession = () => {
    const seed = pendingSession?.cwd ?? listedSession?.cwd ?? listedSession?.projectRoot ?? null;
    setNewSessionSeedCwd(seed);
    setNewSession(true);
    setCreateError(null);
    setSendError(null);
  };

  const cancelNewSession = () => {
    setNewSession(false);
    setNewSessionSeedCwd(null);
    setCreateError(null);
  };

  const createAndStart = async (input: NewSessionInputView): Promise<void> => {
    setCreating(true);
    setCreateError(null);
    setSendError(null);
    let created: string;
    try {
      created = await createSession({
        cwd: input.cwd,
        ...(input.provider !== undefined ? { provider: input.provider } : {}),
        ...(input.modelId !== undefined ? { modelId: input.modelId } : {}),
        ...(input.thinkingLevel !== undefined ? { thinkingLevel: input.thinkingLevel } : {}),
      });
    } catch (cause) {
      setCreating(false);
      setCreateError(errorMessage(cause));
      throw cause;
    }
    setPendingSession({ id: created, cwd: input.cwd });
    setSelected(created);
    setNewSession(false);
    setNewSessionSeedCwd(null);
    window.history.replaceState(null, "", `?session=${encodeURIComponent(created)}`);
    void queryClient.invalidateQueries({ queryKey: ["sessions"] });
    setStreamRevision((value) => value + 1);
    setSending(true);
    try {
      await runIntent(created, { kind: "prompt", text: input.text });
    } catch (cause) {
      setSendError(errorMessage(cause));
    } finally {
      setSending(false);
      setCreating(false);
    }
  };

  const toggleRail = () => updateLayout({ railCollapsed: !layout.railCollapsed });
  const toggleWorkbench = () => updateLayout({ workbenchCollapsed: !layout.workbenchCollapsed });

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      const editing = target?.closest("input, textarea, [contenteditable=true]");
      if (editing) return;
      if (event.key.toLowerCase() === "b" && !event.shiftKey) {
        event.preventDefault();
        updateLayout({ railCollapsed: !layout.railCollapsed });
      } else if (event.shiftKey && event.key.toLowerCase() === "e") {
        event.preventDefault();
        updateLayout({ workbenchCollapsed: !layout.workbenchCollapsed });
      } else if (event.key === ",") {
        event.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [layout.railCollapsed, layout.workbenchCollapsed]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["sessions"] });
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
  };

  return (
    <NotificationProvider sessionId={selected} onSelectSession={selectSession}>
      <div className={styles.shell}>
        {!layout.railCollapsed ? (
          <>
            <div className={styles.railPane} style={{ width: layout.railWidth }}>
              <SessionRail
                sessions={sessions.data?.sessions ?? []}
                projects={projects.data ?? []}
                selected={selected}
                running={running}
                loading={sessions.isLoading}
                error={sessions.isError ? sessions.error.message : null}
                onSelect={selectSession}
                onNewSession={openNewSession}
                onRefresh={refresh}
                onCollapse={toggleRail}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            </div>
            <ResizeHandle
              label="Resize session rail"
              onDelta={(delta) => updateLayout({ railWidth: layout.railWidth + delta })}
              onReset={() => updateLayout({ railWidth: 248 })}
            />
          </>
        ) : null}

        {newSession ? (
          <NewSessionPane
            projects={projects.data ?? []}
            models={models ?? EMPTY_CATALOG}
            modelsLoading={modelsQuery.isLoading}
            busy={creating}
            error={createError}
            initialCwd={newSessionSeedCwd}
            onCancel={cancelNewSession}
            onCreate={createAndStart}
          />
        ) : (
          <ChatPane
            session={session}
            selected={selected}
            snapshot={snapshot}
            context={context.data}
            streamError={streamError ?? sendError}
            extensionRequest={extensionRequest}
            extensionBusy={extensionBusy}
            extensionError={extensionError}
            onExtensionResponse={handleExtensionResponse}
            railCollapsed={layout.railCollapsed}
            workbenchCollapsed={layout.workbenchCollapsed}
            onToggleRail={toggleRail}
            onToggleWorkbench={toggleWorkbench}
            models={models?.modelList ?? EMPTY_MODELS}
            modelsLoading={modelsQuery.isLoading}
            modelValue={modelValue}
            thinkingLevel={thinkingLevel}
            thinkingLevels={thinkingLevels}
            modelLoading={sessionModel.loading}
            onModelChange={handleModelChange}
            onThinkingChange={handleThinkingChange}
            running={agentRunning}
            queue={snapshot?.session.queue ?? EMPTY_QUEUE}
            sending={sending}
            onSend={handleSend}
            onAbort={handleAbort}
            onRemoveQueued={handleRemoveQueued}
            onPromoteQueued={handlePromoteQueued}
          />
        )}

        {!newSession && !layout.workbenchCollapsed && selected ? (
          <>
            <ResizeHandle
              label="Resize workbench"
              onDelta={(delta) => updateLayout({ workbenchWidth: layout.workbenchWidth - delta })}
              onReset={() => updateLayout({ workbenchWidth: 720 })}
            />
            <div className={styles.workbenchPane} style={{ width: layout.workbenchWidth }}>
              <Workbench
                sessionId={selected}
                root={root}
                projectLabel={projectLabel}
                onClose={toggleWorkbench}
              />
            </div>
          </>
        ) : null}
      </div>

      {settingsOpen ? (
        <SystemPanel root={root} sessionId={selected} onClose={() => setSettingsOpen(false)} />
      ) : null}
    </NotificationProvider>
  );
}
