import type { ProjectSummary, SessionSummary } from "@/api/workspace";

export interface RailSlotProps {
  sessions: SessionSummary[];
  projects: ProjectSummary[];
  selected: string | null;
  /** The unsaved chat row; it cannot be archived and is already the active one. */
  draftId: string | null;
  running: ReadonlySet<string>;
  /** Finished sessions with unseen messages; painted as a dot until opened. */
  unseen: ReadonlySet<string>;
  /** Days of silence after which a conversation folds into its group's `Older` rows; `0` = never. */
  hideInactiveAfterDays: number;
  loading: boolean;
  error: string | null;
  onSelect: (sessionId: string) => void;
  onNewSession: (projectPath?: string) => void;
  onRefresh: () => void;
  onCollapse: () => void;
  onOpenSettings: () => void;
  /** Opens the browser folder dialog and registers the chosen directory. */
  onAddWorkspace: () => void;
  /** Marks the session archived; the open chat keeps running and stays open. */
  onArchiveSession: (sessionId: string) => void;
  /** Marks every session of the project archived and hides the project. */
  onArchiveProject: (projectPath: string) => void;
}
