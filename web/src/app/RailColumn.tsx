import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { archiveSession } from "@/api/agent";
import { comparablePath } from "@/api/paths";
import type { SessionSummary } from "@/api/workspace";
import { pickBrowserFolder } from "@/features/rail/pick-workspace-folder";
import { archiveProject, registerProject } from "@/api/workspace";
import { useProjects } from "@/features/projects/use-projects";
import { useArchivedSessions } from "@/features/sessions/use-archived-sessions";
import { useSessions } from "@/features/sessions/use-sessions";
import { useUnseenSessions } from "@/features/sessions/use-unseen-sessions";
import { getLayout, updateLayout } from "@/layout/layout-store";
import { ResizeHandle } from "@/layout/ResizeHandle";
import { useLayoutField } from "@/layout/use-layout";
import { skinFor } from "@/skins/registry";
import { publishSessionCatalog } from "@/state/session-catalog";
import { useAppearance } from "@/state/use-appearance";
import { useRunningSessions } from "@/state/event-stream";
import styles from "./app.module.css";

const EMPTY_RUNNING: string[] = [];
const EMPTY_SESSIONS: readonly SessionSummary[] = [];

interface RailColumnProps {
  selected: string | null;
  pendingId: string | null;
  onPendingListed: () => void;
  onSelect: (sessionId: string) => void;
  onNewSession: (projectPath?: string) => void;
  onOpenSettings: () => void;
}

export function RailColumn({
  selected,
  pendingId,
  onPendingListed,
  onSelect,
  onNewSession,
  onOpenSettings,
}: RailColumnProps) {
  const appearance = useAppearance();
  const collapsed = useLayoutField("railCollapsed");
  const width = useLayoutField("railWidth");
  const sessions = useSessions();
  const projects = useProjects();
  const [addError, setAddError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [archivedView, setArchivedView] = useState(false);
  const queryClient = useQueryClient();
  const archived = useArchivedSessions(archivedView);
  const adding = useRef(false);
  const fallbackRunning = sessions.data?.runningSessionIds ?? EMPTY_RUNNING;
  const running = useRunningSessions(fallbackRunning);
  const unseen = useUnseenSessions(sessions.data?.sessions ?? EMPTY_SESSIONS, running, selected);
  const RailSkin = skinFor("rail", appearance);

  const refreshAfterArchive = async (): Promise<void> => {
    await Promise.all([sessions.refetch(), projects.refetch()]);
    void queryClient.invalidateQueries({ queryKey: ["archived-sessions"] });
  };

  const closeIfArchived = (projectPath: string, sessionIds: readonly string[]): void => {
    if (!selected) return;
    const open = sessions.data?.sessions.find((item) => item.id === selected);
    if (!open) return;
    const matchesSession = sessionIds.includes(open.id);
    const matchesProject = comparablePath(open.projectRoot ?? open.cwd) === comparablePath(projectPath);
    if (matchesSession || matchesProject) onSelect("");
  };

  const handleArchiveSession = (sessionId: string): void => {
    setActionError(null);
    void archiveSession(sessionId)
      .then(async () => {
        if (sessionId === selected) onSelect("");
        await refreshAfterArchive();
      })
      .catch((cause: unknown) => {
        setActionError(cause instanceof Error ? cause.message : "Unable to archive this session");
      });
  };

  const handleArchiveProject = (projectPath: string): void => {
    setActionError(null);
    void archiveProject(projectPath)
      .then(async (result) => {
        closeIfArchived(projectPath, result.archived);
        if (result.failed.length > 0) {
          setActionError(
            `${result.failed.length} session${result.failed.length === 1 ? "" : "s"} could not be archived`,
          );
        }
        await refreshAfterArchive();
      })
      .catch((cause: unknown) => {
        setActionError(cause instanceof Error ? cause.message : "Unable to archive this project");
      });
  };

  useEffect(() => {
    publishSessionCatalog(sessions.data?.sessions ?? [], projects.data ?? []);
  }, [sessions.data, projects.data]);

  useEffect(() => {
    if (!pendingId) return;
    if (sessions.data?.sessions.some((item) => item.id === pendingId)) onPendingListed();
  }, [pendingId, sessions.data, onPendingListed]);

  if (collapsed) {
    return (
      <button
        type="button"
        className={styles.showRail}
        onClick={() => updateLayout({ railCollapsed: false })}
        title="Show sessions"
        aria-label="Show sessions"
      >
        ☰
      </button>
    );
  }

  return (
    <>
      <div className={styles.railPane} style={{ width }}>
        <RailSkin
          sessions={sessions.data?.sessions ?? []}
          projects={projects.data ?? []}
          selected={selected}
          running={running}
          unseen={unseen}
          loading={sessions.isLoading}
          error={actionError ?? addError ?? (sessions.isError ? sessions.error.message : null)}
          archivedView={archivedView}
          archived={archived.data ?? []}
          archivedLoading={archived.isFetching}
          archivedError={archived.isError ? archived.error.message : null}
          onSelect={onSelect}
          onNewSession={onNewSession}
          onToggleArchivedView={() => {
            setActionError(null);
            setArchivedView((value) => !value);
          }}
          onArchiveSession={handleArchiveSession}
          onArchiveProject={handleArchiveProject}
          onRefresh={() => {
            void sessions.refetch();
            void projects.refetch();
          }}
          onCollapse={() => updateLayout({ railCollapsed: true })}
          onOpenSettings={onOpenSettings}
          onAddWorkspace={() => {
            if (adding.current) return;
            adding.current = true;
            setAddError(null);
            void pickBrowserFolder()
              .then(async (path) => {
                if (!path) return;
                await registerProject(path);
                await projects.refetch();
              })
              .catch((cause: unknown) => {
                setAddError(cause instanceof Error ? cause.message : "Unable to add this folder");
              })
              .finally(() => {
                adding.current = false;
              });
          }}
        />
      </div>
      <ResizeHandle
        label="Resize session rail"
        onDelta={(delta) => updateLayout({ railWidth: getLayout().railWidth + delta })}
        onReset={() => updateLayout({ railWidth: 248 })}
      />
    </>
  );
}
