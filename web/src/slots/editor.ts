import type { TranscriptClasses } from "@/features/chat/classes";
import type { WorkbenchTab } from "@/layout/layout-store";

export interface EditorSlotProps {
  /** Transcript styling for read-only agent tabs, supplied by the skin. */
  transcriptClasses: TranscriptClasses;
  sessionId: string;
  primaryRoot: string | null;
  roots: readonly string[];
  tabs: readonly WorkbenchTab[];
  activeTabId: string | null;
  onTabScroll: (tabId: string, scrollTop: number) => void;
  onInlinePrompt?: (text: string) => Promise<void>;
}
