import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { basename, comparablePath } from "@/api/paths";
import { useProjects } from "@/features/projects/use-projects";
import { useSessions } from "@/features/sessions/use-sessions";
import { SessionRail } from "@/features/rail/SessionRail";
import { ChatPane } from "@/features/chat/ChatPane";
import { Workbench } from "@/features/workbench/Workbench";
import { useSessionContext } from "@/features/workbench/use-workbench-data";
import { ensureWorkbenchRoot, updateLayout } from "@/layout/layout-store";
import { ResizeHandle } from "@/layout/ResizeHandle";
import { useLayout } from "@/layout/use-layout";
import { useRunningSessions, useSessionStream, useWorkspaceEvents } from "@/state/event-stream";
import { useSessionSnapshot } from "@/state/use-session-snapshot";
import styles from "./app.module.css";

const EMPTY_RUNNING: string[] = [];

export function App() {
  const queryClient = useQueryClient();
  const layout = useLayout();
  const sessions = useSessions();
  const projects = useProjects();
  const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(window.location.search).get("session"));
  const [sendError, setSendError] = useState<string | null>(null);

  const snapshot = useSessionSnapshot(selected);
  const session = sessions.data?.sessions.find((item) => item.id === selected) ?? null;
  const root = session?.cwd ?? null;
  const projectRoot = session?.projectRoot ?? root;
  const projectLabel = useMemo(() => {
    if (!projectRoot) return "";
    const match = projects.data?.find((project) => comparablePath(project.path) === comparablePath(projectRoot));
    return match?.alias?.trim() || basename(projectRoot);
  }, [projectRoot, projects.data]);

  const fallbackRunning = sessions.data?.runningSessionIds ?? EMPTY_RUNNING;
  const running = useRunningSessions(fallbackRunning);
  const { error: streamError } = useSessionStream(selected);
  const context = useSessionContext(selected, !snapshot);
  useWorkspaceEvents(root);

  useEffect(() => {
    if (selected && root) ensureWorkbenchRoot(selected, root);
  }, [root, selected]);

  const selectSession = (sessionId: string) => {
    setSelected(sessionId);
    setSendError(null);
    window.history.replaceState(null, "", `?session=${encodeURIComponent(sessionId)}`);
  };

  const sendPrompt = async (text: string) => {
    if (!selected) return;
    setSendError(null);
    const { error } = await api.POST("/api/agent/sessions/{id}/intent", {
      params: { path: { id: selected } },
      body: { kind: "prompt", text },
    });
    if (error) setSendError(error.error ?? "Failed to send the prompt");
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
              onRefresh={refresh}
              onCollapse={toggleRail}
            />
          </div>
          <ResizeHandle
            label="Resize session rail"
            onDelta={(delta) => updateLayout({ railWidth: layout.railWidth + delta })}
            onReset={() => updateLayout({ railWidth: 248 })}
          />
        </>
      ) : null}

      <ChatPane
        session={session}
        selected={selected}
        snapshot={snapshot}
        context={context.data}
        streamError={streamError ?? sendError}
        railCollapsed={layout.railCollapsed}
        workbenchCollapsed={layout.workbenchCollapsed}
        onToggleRail={toggleRail}
        onToggleWorkbench={toggleWorkbench}
        onSend={sendPrompt}
      />

      {!layout.workbenchCollapsed && selected ? (
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
  );
}
