import type { ComponentType } from "react";
import type { GitStatus, ProjectSummary } from "@/api/workspace";
import type { DiffTabSource, WorkbenchTab, WorkbenchView } from "@/layout/layout-store";
import type { ChangesSlotData } from "@/slots/changes";
import type { LspDocumentState } from "@/state/lsp-store";

export interface FilesGitState {
  status: GitStatus | undefined;
  loading: boolean;
  error: string | null;
}

export interface FilesSlotProps {
  sessionId: string;
  primaryRoot: string | null;
  projectLabel: string;
  roots: readonly string[];
  view: WorkbenchView;
  expanded: readonly string[];
  tabs: readonly WorkbenchTab[];
  activeTabId: string | null;
  treeScrollTop: number;
  changesScrollTop: number;
  navigatorWidth: number;
  navigatorCollapsed: boolean;
  /** Keyed by `comparablePath(root)`. */
  gitByRoot: ReadonlyMap<string, FilesGitState>;
  problems: readonly LspDocumentState[];
  availableProjects: readonly ProjectSummary[];
  /** Resolved by the shell so this skin never imports another slot. */
  ChangesView: ComponentType<ChangesSlotData>;
  onClose: () => void;
  onSelectView: (view: WorkbenchView) => void;
  onToggleExpanded: (path: string) => void;
  onOpenFile: (path: string, preview: boolean) => void;
  onOpenFileAt: (path: string, line: number, column: number) => void;
  onOpenTerminal: (root: string) => void;
  onAddRoot: (root: string) => void;
  onRemoveRoot: (root: string) => void;
  onRenamed: (from: string, to: string) => void;
  onDeleted: (path: string) => void;
  onTreeScroll: (scrollTop: number) => void;
  onChangesScroll: (scrollTop: number) => void;
  onRefreshGit: (root: string) => void;
  onOpenDiff: (source: DiffTabSource) => void;
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onTabScroll: (tabId: string, scrollTop: number) => void;
  onToggleNavigator: () => void;
  onResizeNavigator: (delta: number) => void;
  onResetNavigator: () => void;
  onInlinePrompt?: (text: string) => Promise<void>;
}
