import type { ProjectSummary, SessionSummary } from "@/api/workspace";

export interface RailSlotProps {
  sessions: SessionSummary[];
  projects: ProjectSummary[];
  selected: string | null;
  running: ReadonlySet<string>;
  loading: boolean;
  error: string | null;
  onSelect: (sessionId: string) => void;
  onNewSession: (projectPath?: string) => void;
  onRefresh: () => void;
  onCollapse: () => void;
  onOpenSettings: () => void;
}
