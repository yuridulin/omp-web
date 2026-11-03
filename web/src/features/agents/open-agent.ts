import { openSubagentTab, updateLayout } from "@/layout/layout-store";

/**
 * Open a subagent's read-only view.
 *
 * One intent for both entry points (the roster list and the strip above the
 * composer): open or focus the tab, and reveal the workbench column, because a
 * click whose target stays hidden looks like nothing happened.
 */
export function openAgent(sessionId: string, subagentId: string, title?: string): void {
  openSubagentTab(sessionId, subagentId, title ?? subagentId);
  updateLayout({ workbenchCollapsed: false });
}
