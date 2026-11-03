import type { ProjectSummary, SessionSummary } from "@/api/workspace";

export interface RailSlotProps {
  sessions: SessionSummary[];
  projects: ProjectSummary[];
  selected: string | null;
  running: ReadonlySet<string>;
  /** Finished sessions with unseen messages; painted as a dot until opened. */
  unseen: ReadonlySet<string>;
  loading: boolean;
  error: string | null;
  onSelect: (sessionId: string) => void;
  onNewSession: (projectPath?: string) => void;
  onRefresh: () => void;
  onCollapse: () => void;
  onOpenSettings: () => void;
  /** Opens the browser folder dialog and registers the chosen directory. */
  onAddWorkspace: () => void;
  /** Archives the session and closes it if it is the open one. */
  onArchiveSession: (sessionId: string) => void;
  /** Archives every session of the project and hides the project. */
  onArchiveProject: (projectPath: string) => void;
}
