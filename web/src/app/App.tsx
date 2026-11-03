import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { scheduleIdle } from "@/state/schedule-idle";
import { useQueryClient } from "@tanstack/react-query";
import { createSession, dispatchIntent, type ModelCatalog } from "@/api/agent";
import type { SessionSummary } from "@/api/workspace";
import { ChatColumn } from "@/app/ChatColumn";
import { RailColumn } from "@/app/RailColumn";
import { WorkbenchColumn } from "@/app/WorkbenchColumn";
import { NewSessionPane, type NewSessionInputView } from "@/features/chat/NewSessionPane";
import { useProjects } from "@/features/projects/use-projects";
import { useModels } from "@/features/sessions/use-models";
import { SystemPanel } from "@/features/system/SystemPanel";
import { getLayout, updateLayout } from "@/layout/layout-store";
import { catalogSession, useSessionPaths } from "@/state/session-catalog";
import { bumpStreamGeneration } from "@/state/stream-generation";
import { NotificationProvider } from "@/state/notification-center";
import styles from "./app.module.css";

const EMPTY_CATALOG: ModelCatalog = { modelList: [], defaultModel: null, thinkingLevels: {} };

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

interface PendingSession {
  id: string;
  cwd: string;
}

function WarmHeavyChunks() {
  useEffect(() => scheduleIdle(() => {
    void import("@/editor/CodeEditor");
    void import("@/editor/DiffEditor");
    void import("@/features/workbench/TerminalView");
  }), []);
  return null;
}

function ShellHotkeys({
  onNewSession,
  onOpenSettings,
}: {
  onNewSession: () => void;
  onOpenSettings: () => void;
}) {
  const newSessionRef = useRef(onNewSession);
  const settingsRef = useRef(onOpenSettings);
  newSessionRef.current = onNewSession;
  settingsRef.current = onOpenSettings;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target?.closest("input, textarea, select, [contenteditable=true]");
      if (editing) return;
      const layout = getLayout();
      if (!(event.ctrlKey || event.metaKey)) {
        if (event.key.toLowerCase() === "n" && !event.altKey && !event.shiftKey) {
          event.preventDefault();
          newSessionRef.current();
        }
        return;
      }
      if (event.key.toLowerCase() === "b" && !event.shiftKey) {
        event.preventDefault();
        updateLayout({ railCollapsed: !layout.railCollapsed });
      } else if (event.shiftKey && event.key.toLowerCase() === "e") {
        event.preventDefault();
        updateLayout({ workbenchCollapsed: !layout.workbenchCollapsed });
      } else if (event.key === ",") {
        event.preventDefault();
        settingsRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return null;
}

function NewSessionHost({
  busy,
  error,
  initialCwd,
  onCancel,
  onCreate,
}: {
  busy: boolean;
  error: string | null;
  initialCwd: string | null;
  onCancel: () => void;
  onCreate: (input: NewSessionInputView) => Promise<void>;
}) {
  const projects = useProjects();
  const modelsQuery = useModels();
  return (
    <NewSessionPane
      projects={projects.data ?? []}
      models={modelsQuery.data ?? EMPTY_CATALOG}
      modelsLoading={modelsQuery.isLoading}
      busy={busy}
      error={error}
      initialCwd={initialCwd}
      onCancel={onCancel}
      onCreate={onCreate}
    />
  );
}

function SettingsHost({ sessionId, onClose }: { sessionId: string | null; onClose: () => void }) {
  const paths = useSessionPaths(sessionId);
  return <SystemPanel root={paths.root} sessionId={sessionId} onClose={onClose} />;
}

export function App() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(window.location.search).get("session"));
  const [newSession, setNewSession] = useState(false);
  const [newSessionSeedCwd, setNewSessionSeedCwd] = useState<string | null>(null);
  const [pendingSession, setPendingSession] = useState<PendingSession | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  const onPendingListed = useCallback(() => setPendingSession(null), []);

  const selectSession = (sessionId: string) => {
    const next = sessionId || null;
    setSelected(next);
    setNewSession(false);
    setNewSessionSeedCwd(null);
    setPendingSession(null);
    setCreateError(null);
    setStartError(null);
    window.history.replaceState(
      null,
      "",
      next ? `?session=${encodeURIComponent(next)}` : window.location.pathname,
    );
  };

  const openNewSession = (projectPath?: string) => {
    const listed = catalogSession(selected);
    const seed = projectPath
      ?? pendingSession?.cwd
      ?? listed?.cwd
      ?? listed?.projectRoot
      ?? null;
    setNewSessionSeedCwd(seed);
    setNewSession(true);
    setCreateError(null);
  };

  const cancelNewSession = () => {
    setNewSession(false);
    setNewSessionSeedCwd(null);
    setCreateError(null);
  };

  const createAndStart = async (input: NewSessionInputView): Promise<void> => {
    setCreating(true);
    setCreateError(null);
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
    bumpStreamGeneration();
    setStarting(true);
    try {
      const result = await dispatchIntent(created, { kind: "prompt", text: input.text });
      if (result.bootstrapped) bumpStreamGeneration();
    } catch (cause) {
      setStartError(errorMessage(cause));
    } finally {
      setStarting(false);
      setCreating(false);
    }
  };

  return (
    <NotificationProvider sessionId={selected} onSelectSession={selectSession}>
      <WarmHeavyChunks />
      <ShellHotkeys onNewSession={() => openNewSession()} onOpenSettings={() => setSettingsOpen(true)} />
      <div className={styles.shell}>
        <RailColumn
          selected={selected}
          pendingId={pendingSession?.id ?? null}
          onPendingListed={onPendingListed}
          onSelect={selectSession}
          onNewSession={openNewSession}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        {newSession ? (
          <NewSessionHost
            busy={creating}
            error={createError}
            initialCwd={newSessionSeedCwd}
            onCancel={cancelNewSession}
            onCreate={createAndStart}
          />
        ) : (
          <ChatColumn
            selected={selected}
            pendingSession={pendingSummary}
            externalError={startError}
            externalSending={starting}
          />
        )}
        {!newSession && selected ? (
          <WorkbenchColumn
            selected={selected}
            pendingCwd={pendingSession?.id === selected ? pendingSession.cwd : null}
          />
        ) : null}
      </div>
      {settingsOpen ? <SettingsHost sessionId={selected} onClose={() => setSettingsOpen(false)} /> : null}
    </NotificationProvider>
  );
}
