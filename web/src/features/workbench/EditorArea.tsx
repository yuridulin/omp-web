import { lazy, Suspense, useEffect, useState } from "react";
import { scheduleIdle } from "@/state/schedule-idle";
import { rootForPath } from "@/api/paths";
import type { WorkbenchTab } from "@/layout/layout-store";
import type { EditorSlotProps } from "@/slots/editor";
import { SubagentView } from "@/features/agents/SubagentView";
import { DiffView } from "./DiffView";
import { FileView } from "./FileView";
import styles from "./editor-area.module.css";

// Static import would pull xterm into the initial bundle; the shell loads the
// terminal chunk only when a terminal tab is open.
const TerminalView = lazy(() => import("./TerminalView").then((module) => ({ default: module.TerminalView })));

/** Keep a terminal mounted after its first view so switching tabs does not drop the xterm buffer. */
export function retainTerminals(
  seen: readonly string[],
  tabs: readonly WorkbenchTab[],
  activeTabId: string | null,
): string[] {
  const live = new Set<string>();
  for (const tab of tabs) {
    if (tab.kind === "terminal") live.add(tab.id);
  }
  const next: string[] = [];
  for (const id of seen) {
    if (live.has(id)) next.push(id);
  }
  if (activeTabId !== null && live.has(activeTabId) && !next.includes(activeTabId)) next.push(activeTabId);
  return next;
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export function EditorArea({
  sessionId,
  primaryRoot,
  roots,
  tabs,
  activeTabId,
  transcriptClasses,
  onTabScroll,
  onInlinePrompt,
}: EditorSlotProps) {
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const terminalTabs = tabs.filter((tab) => tab.kind === "terminal");
  const [seen, setSeen] = useState<string[]>([]);
  const [widgetsReady, setWidgetsReady] = useState(false);
  useEffect(() => scheduleIdle(() => setWidgetsReady(true)), []);
  const mountedIds = retainTerminals(seen, tabs, widgetsReady ? activeTabId : null);
  if (!sameIds(seen, mountedIds)) setSeen(mountedIds);
  const mounted = new Set(mountedIds);

  const renderActive = () => {
    if (!activeTab) return null;
    if (activeTab.kind === "file") {
      return (
        <FileView
          key={activeTab.id}
          path={activeTab.path}
          sessionId={sessionId}
          root={rootForPath(roots, activeTab.path)}
          {...(activeTab.position ? { position: activeTab.position } : {})}
          {...(activeTab.scrollTop !== undefined ? { scrollTop: activeTab.scrollTop } : {})}
          {...(onInlinePrompt ? { onInlinePrompt } : {})}
          onScroll={(scrollTop) => onTabScroll(activeTab.id, scrollTop)}
        />
      );
    }
    if (activeTab.kind === "subagent") {
      const subagentId = activeTab.subagentId ?? activeTab.path;
      return (
        <SubagentView
          key={activeTab.id}
          sessionId={sessionId}
          subagentId={subagentId}
          classes={transcriptClasses}
        />
      );
    }
    if (!activeTab.diff) return null;
    return <DiffView key={activeTab.id} source={activeTab.diff} />;
  };

  return (
    <div className={styles.body}>
      {widgetsReady && activeTab && activeTab.kind !== "terminal" ? renderActive() : null}
      {!widgetsReady && activeTab && activeTab.kind !== "terminal" ? (
        <div className={styles.status}>Loading editor…</div>
      ) : null}
      {terminalTabs.map((tab) => {
        if (!mounted.has(tab.id)) return null;
        const visible = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className={styles.terminalArea}
            data-terminal-id={tab.id}
            style={{ display: visible ? "flex" : "none" }}
          >
            <Suspense fallback={<div className={styles.status}>Loading terminal…</div>}>
              <TerminalView cwd={tab.terminalCwd ?? primaryRoot ?? ""} active={visible} />
            </Suspense>
          </div>
        );
      })}
      {activeTab ? null : (
        <div className={styles.empty}>
          <p>{roots.length > 0 ? "Open a file from the tree." : "No workspace root."}</p>
          <p className={styles.muted}>Files and diffs stay attached to this session.</p>
        </div>
      )}
    </div>
  );
}
