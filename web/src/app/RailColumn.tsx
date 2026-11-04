import { useEffect, useMemo, useRef, useState } from "react";
import { archiveSession } from "@/api/agent";
import { rootForPath } from "@/api/paths";
import type { SessionSummary } from "@/api/workspace";
import { archiveProject, pickNativeFolder, registerProject } from "@/api/workspace";
import { useProjects } from "@/features/projects/use-projects";
import { WorkspacePicker } from "@/features/projects/WorkspacePicker";
import { useSessions } from "@/features/sessions/use-sessions";
import { useUnseenSessions } from "@/features/sessions/use-unseen-sessions";
import { useWebSettings } from "@/features/system/use-system-config";
import { DEFAULT_INACTIVE_SESSION_DAYS } from "@/api/system-config";
import { getLayout, updateLayout } from "@/layout/layout-store";
import { ResizeHandle } from "@/layout/ResizeHandle";
import { useLayoutField } from "@/layout/use-layout";
import { skinFor } from "@/skins/registry";
import { NEW_SESSION_DRAFT_ID } from "@/state/composer-store";
import { publishSessionCatalog } from "@/state/session-catalog";
import { useAppearance } from "@/state/use-appearance";
import { useRunningSessions } from "@/state/event-stream";
import styles from "./app.module.css";

const EMPTY_RUNNING: string[] = [];
const EMPTY_SESSIONS: SessionSummary[] = [];

interface RailColumnProps {
  selected: string | null;
  /** Workspace of the unsaved chat, shown as a draft row while it has no session. */
  draftCwd: string | null;
  pendingId: string | null;
  onPendingListed: () => void;
  onSelect: (sessionId: string) => void;
  onNewSession: (projectPath?: string) => void;
  onOpenSettings: () => void;
}

export function RailColumn({
  selected,
  draftCwd,
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
  const webSettings = useWebSettings();
  const [actionError, setActionError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerNotice, setPickerNotice] = useState<string | null>(null);
  const adding = useRef(false);
  const fallbackRunning = sessions.data?.runningSessionIds ?? EMPTY_RUNNING;
  const running = useRunningSessions(fallbackRunning);
  const allSessions = sessions.data?.sessions ?? EMPTY_SESSIONS;
  const visibleSessions = useMemo(
    () => allSessions.filter((session) => !session.archived),
    [allSessions],
  );
  const unseen = useUnseenSessions(visibleSessions, running, selected);
  const RailSkin = skinFor("rail", appearance);

  const draft = useMemo<SessionSummary | null>(() => {
    if (selected !== null) return null;
    const cwd = draftCwd?.trim() ?? "";
    if (cwd === "") return null;
    const projectRoot = rootForPath(
      (projects.data ?? []).map((project) => project.path),
      cwd,
    ) ?? cwd;
    const now = new Date().toISOString();
    return {
      path: "",
      id: NEW_SESSION_DRAFT_ID,
      cwd,
      name: "New session",
      created: now,
      modified: now,
      messageCount: 0,
      firstMessage: "",
      projectRoot,
    };
  }, [selected, draftCwd, projects.data]);

  const listedSessions = useMemo(
    () => (draft ? [draft, ...allSessions] : allSessions),
    [draft, allSessions],
  );

  const refreshAfterArchive = async (): Promise<void> => {
    await Promise.all([sessions.refetch(), projects.refetch()]);
  };

  const handleArchiveSession = (sessionId: string): void => {
    setActionError(null);
    void archiveSession(sessionId)
      .then(refreshAfterArchive)
      .catch((cause: unknown) => {
        setActionError(cause instanceof Error ? cause.message : "Unable to archive this session");
      });
  };

  const handleArchiveProject = (projectPath: string): void => {
    setActionError(null);
    void archiveProject(projectPath)
      .then(refreshAfterArchive)
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
          sessions={listedSessions}
          projects={projects.data ?? []}
          selected={selected ?? draft?.id ?? null}
          draftId={draft?.id ?? null}
          running={running}
          unseen={unseen}
          hideInactiveAfterDays={webSettings.data?.hideInactiveSessionsAfterDays ?? DEFAULT_INACTIVE_SESSION_DAYS}
          loading={sessions.isLoading}
          error={actionError ?? (sessions.isError ? sessions.error.message : null)}
          onSelect={(sessionId) => {
            if (draft && sessionId === draft.id) return;
            onSelect(sessionId);
          }}
          onNewSession={onNewSession}
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
            setActionError(null);
            void pickNativeFolder(draftCwd ?? undefined)
              .then(async (pick) => {
                if (pick.kind === "unavailable") {
                  // Headless host or no GUI toolkit: fall back to the server's file listing.
                  setPickerNotice(`${pick.reason} — choose a folder from the server's filesystem instead.`);
                  setPickerOpen(true);
                  return;
                }
                if (pick.kind !== "picked") return;
                await registerProject(pick.path);
                await projects.refetch();
              })
              .catch((cause: unknown) => {
                setActionError(cause instanceof Error ? cause.message : "Unable to add this workspace");
              })
              .finally(() => {
                adding.current = false;
              });
          }}
        />
      </div>
      {pickerOpen ? (
        <WorkspacePicker
          {...(pickerNotice ? { notice: pickerNotice } : {})}
          onClose={() => setPickerOpen(false)}
          onChoose={async (path) => {
            await registerProject(path);
            await projects.refetch();
            setPickerOpen(false);
          }}
        />
      ) : null}
      <ResizeHandle
        label="Resize session rail"
        onDelta={(delta) => updateLayout({ railWidth: getLayout().railWidth + delta })}
        onReset={() => updateLayout({ railWidth: 248 })}
      />
    </>
  );
}
