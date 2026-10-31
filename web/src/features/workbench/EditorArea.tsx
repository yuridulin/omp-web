import { lazy, Suspense } from "react";
import { rootForPath } from "@/api/paths";
import type { EditorSlotProps } from "@/slots/editor";
import { DiffView } from "./DiffView";
import { FileView } from "./FileView";
import styles from "./editor-area.module.css";

// Static import would pull xterm into the initial bundle; the shell loads the
// terminal chunk only when a terminal tab is open.
const TerminalView = lazy(() => import("./TerminalView").then((module) => ({ default: module.TerminalView })));

export function EditorArea({
  sessionId,
  primaryRoot,
  roots,
  tabs,
  activeTabId,
  onTabScroll,
  onInlinePrompt,
}: EditorSlotProps) {
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const terminalTabs = tabs.filter((tab) => tab.kind === "terminal");

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
    if (!activeTab.diff) return null;
    return <DiffView key={activeTab.id} source={activeTab.diff} />;
  };

  return (
    <div className={styles.body}>
      {activeTab && activeTab.kind !== "terminal" ? renderActive() : null}
      {terminalTabs.map((tab) => {
        const visible = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className={styles.terminalArea}
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
