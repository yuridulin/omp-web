import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { scheduleIdle } from "@/state/schedule-idle";
import { useQueryClient } from "@tanstack/react-query";
import type { SessionSummary } from "@/api/workspace";
import { ChatColumn } from "@/app/ChatColumn";
import { RailColumn } from "@/app/RailColumn";
import { WorkbenchColumn } from "@/app/WorkbenchColumn";
import { SystemPanel } from "@/features/system/SystemPanel";
import { getLayout, updateLayout } from "@/layout/layout-store";
import { catalogSession, useSessionPaths } from "@/state/session-catalog";
import { bumpStreamGeneration } from "@/state/stream-generation";
import { NotificationProvider } from "@/state/notification-center";
import styles from "./app.module.css";

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

function SettingsHost({ sessionId, onClose }: { sessionId: string | null; onClose: () => void }) {
  const paths = useSessionPaths(sessionId);
  return <SystemPanel root={paths.root} sessionId={sessionId} onClose={onClose} />;
}

export function App() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(window.location.search).get("session"));
  const [newSessionSeedCwd, setNewSessionSeedCwd] = useState<string | null>(null);
  const [newSessionEpoch, setNewSessionEpoch] = useState(0);
  /** Cwd of the unsaved chat; the rail and workbench paint it before a session exists. */
  const [draftCwd, setDraftCwd] = useState<string | null>(null);
  const [pendingSession, setPendingSession] = useState<PendingSession | null>(null);
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
    setNewSessionSeedCwd(null);
    setDraftCwd(null);
    setPendingSession(null);
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
    setDraftCwd(seed);
    setNewSessionEpoch((epoch) => epoch + 1);
    setSelected(null);
    window.history.replaceState(null, "", window.location.pathname);
  };

  const handleSessionCreated = (id: string, cwd: string) => {
    setPendingSession({ id, cwd });
    setSelected(id);
    setNewSessionSeedCwd(null);
    setDraftCwd(null);
    window.history.replaceState(null, "", `?session=${encodeURIComponent(id)}`);
    void queryClient.invalidateQueries({ queryKey: ["sessions"] });
    bumpStreamGeneration();
  };

  return (
    <NotificationProvider sessionId={selected} onSelectSession={selectSession}>
      <WarmHeavyChunks />
      <ShellHotkeys onNewSession={() => openNewSession()} onOpenSettings={() => setSettingsOpen(true)} />
      <div className={styles.shell}>
        <RailColumn
          selected={selected}
          draftCwd={draftCwd}
          pendingId={pendingSession?.id ?? null}
          onPendingListed={onPendingListed}
          onSelect={selectSession}
          onNewSession={openNewSession}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <ChatColumn
          selected={selected}
          pendingSession={pendingSummary}
          newSessionCwd={newSessionSeedCwd}
          newSessionEpoch={newSessionEpoch}
          onDraftCwdChange={setDraftCwd}
          onSessionCreated={handleSessionCreated}
        />
        <WorkbenchColumn
          selected={selected}
          pendingCwd={selected === null
            ? draftCwd
            : pendingSession?.id === selected
              ? pendingSession.cwd
              : null}
        />
      </div>
      {settingsOpen ? <SettingsHost sessionId={selected} onClose={() => setSettingsOpen(false)} /> : null}
    </NotificationProvider>
  );
}
