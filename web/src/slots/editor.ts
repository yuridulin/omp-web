import type { WorkbenchTab } from "@/layout/layout-store";

export interface EditorSlotProps {
  sessionId: string;
  primaryRoot: string | null;
  roots: readonly string[];
  tabs: readonly WorkbenchTab[];
  activeTabId: string | null;
  onTabScroll: (tabId: string, scrollTop: number) => void;
  onInlinePrompt?: (text: string) => Promise<void>;
}
