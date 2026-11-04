import type { ProjectSummary, SessionSummary } from "@/api/workspace";

export interface RailSlotProps {
  /** Every session, archived included; the skin hides archived by default. */
  sessions: SessionSummary[];
  projects: ProjectSummary[];
  selected: string | null;
  /**
   * A row the server list does not carry yet: the unsaved chat, or a session
   * created moments ago whose file omp has not written. It cannot be archived.
   */
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
  /** Opens the workspace picker over the server's filesystem. */
  onAddWorkspace: () => void;
  /** Marks the session archived; the open chat keeps running and stays open. */
  onArchiveSession: (sessionId: string) => void;
  /** Marks every session of the project archived and hides the project. */
  onArchiveProject: (projectPath: string) => void;
}
