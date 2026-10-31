import type { GitBranch } from "@/api/git-write";
import type { GitStatus } from "@/api/workspace";
import type { DiffTabSource } from "@/layout/layout-store";

/** Data the files skin can supply for each workspace root. */
export interface ChangesSlotData {
  root: string;
  label?: string;
  status: GitStatus | undefined;
  loading: boolean;
  error: string | null;
  scrollTop: number;
  onOpen: (source: DiffTabSource) => void;
  onRefresh: () => void;
  onScroll: (scrollTop: number) => void;
}

/** Everything a changes skin renders; the controller supplies git actions. */
export interface ChangesSlotProps extends ChangesSlotData {
  pending: boolean;
  writeError: string | null;
  branches: GitBranch[];
  currentBranch: string | null;
  branchesLoading: boolean;
  branchesError: string | null;
  onStage: (paths: string[]) => void;
  onUnstage: (paths: string[]) => void;
  onStageAll: () => void;
  onUnstageAll: () => void;
  onCommit: (message: string, amend: boolean) => Promise<void>;
  onCheckout: (branch: string) => Promise<void>;
  onCreateBranch: (name: string) => Promise<void>;
}
