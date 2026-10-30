import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { closeLspDocument } from "@/api/lsp";
import { basename, comparablePath, rootForPath } from "@/api/paths";
import { fetchGitStatus } from "@/api/workspace";
import { ResizeHandle } from "@/layout/ResizeHandle";
import {
  addWorkbenchRoot,
  closeTab,
  closeTabsForPath,
  openDiffTab,
  openFileTab,
  openTerminalTab,
  removeWorkbenchRoot,
  renameFileTabs,
  setActiveTab,
  setChangesScroll,
  setTabScroll,
  setTreeScroll,
  setWorkbenchView,
  toggleExpanded,
  type WorkbenchTab,
} from "@/layout/layout-store";
import { updateLayout } from "@/layout/layout-store";
import { useLayout, useWorkbench } from "@/layout/use-layout";
import { useProjects } from "@/features/projects/use-projects";
import { removeLspDiagnostics, useAllDiagnostics } from "@/state/lsp-store";
import { ChangesList } from "./ChangesList";
import { DiffView } from "./DiffView";
import { FileTree } from "./FileTree";
import { FileView } from "./FileView";
import { ProblemsList } from "./ProblemsList";
import { forgetEditorTab, renameEditorTab } from "./editor-state";
import { Tabs } from "./Tabs";
import styles from "./workbench.module.css";

// Static import would pull xterm into the initial bundle; the shell loads the
// terminal chunk only when a terminal tab is open.
const TerminalView = lazy(() => import("./TerminalView").then((module) => ({ default: module.TerminalView })));

interface WorkbenchProps {
  sessionId: string;
  primaryRoot: string | null;
  projectLabel: string;
  onClose: () => void;
  onInlinePrompt?: (text: string) => Promise<void>;
}

export function Workbench({ sessionId, primaryRoot, projectLabel, onClose, onInlinePrompt }: WorkbenchProps) {
  const layout = useLayout();
  const context = useWorkbench(sessionId);
  const roots = context.roots;
  const projects = useProjects();
  const [addOpen, setAddOpen] = useState(false);
  const gitQueries = useQueries({
    queries: roots.map((root) => ({
      queryKey: ["git-status", root],
      queryFn: () => fetchGitStatus(root),
      staleTime: 3_000,
      refetchInterval: 10_000,
    })),
  });
  const gitByRoot = new Map<string, (typeof gitQueries)[number]>();
  roots.forEach((root, index) => {
    const query = gitQueries[index];
    if (query) gitByRoot.set(comparablePath(root), query);
  });
  const activeTab = context.tabs.find((tab) => tab.id === context.activeTabId) ?? null;
  const terminalTabs = context.tabs.filter((tab) => tab.kind === "terminal");
  const changesCount = gitQueries.reduce((total, query) => total + (query.data?.files.length ?? 0), 0);
  const problems = useAllDiagnostics(roots);
  const problemsCount = problems.reduce((total, document) => total + document.diagnostics.length, 0);
  const filePaths = context.tabs.filter((tab) => tab.kind === "file").map((tab) => tab.path);
  const filePathsKey = filePaths.join("\n");
  const rootsKey = roots.join("\n");
  const previousFilesRef = useRef(new Map<string, string | null>());

  // The server owns open documents; closing a tab closes its document so the
  // language server can forget the buffer. A tab whose most specific root
  // changed (an overlapping root was added or removed) moves between roots, so
  // the document tracked under the old root must close too.
  useEffect(() => {
    const current = new Map<string, string | null>();
    for (const path of filePaths) current.set(path, rootForPath(roots, path));
    for (const [path, previousRoot] of previousFilesRef.current) {
      if (!previousRoot) continue;
      const nextRoot = current.get(path) ?? null;
      if (nextRoot && comparablePath(nextRoot) === comparablePath(previousRoot)) continue;
      void closeLspDocument({ root: previousRoot, path }).catch(() => {});
      removeLspDiagnostics(previousRoot, path);
    }
    previousFilesRef.current = current;
    // `filePathsKey` and `rootsKey` capture both sets without array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePathsKey, rootsKey]);
  const availableProjects = (projects.data ?? []).filter(
    (project) => !roots.some((root) => comparablePath(root) === comparablePath(project.path)),
  );

  const renderActive = (tab: WorkbenchTab) => {
    if (tab.kind === "file") {
      return (
        <FileView
          key={tab.id}
          path={tab.path}
          sessionId={sessionId}
          root={rootForPath(roots, tab.path)}
          {...(tab.position ? { position: tab.position } : {})}
          {...(tab.scrollTop !== undefined ? { scrollTop: tab.scrollTop } : {})}
          {...(onInlinePrompt ? { onInlinePrompt } : {})}
          onScroll={(scrollTop) => setTabScroll(sessionId, tab.id, scrollTop)}
        />
      );
    }
    if (!tab.diff) return null;
    return <DiffView key={tab.id} source={tab.diff} />;
  };

  return (
    <section className={styles.workbench}>
      <header className={styles.header}>
        <div className={styles.viewTabs}>
          <button
            className={context.view === "files" ? styles.viewTabActive : styles.viewTab}
            onClick={() => setWorkbenchView(sessionId, "files")}
          >
            Files
          </button>
          <button
            className={context.view === "changes" ? styles.viewTabActive : styles.viewTab}
            onClick={() => setWorkbenchView(sessionId, "changes")}
          >
            Changes
            {changesCount > 0 ? <span className={styles.viewCount}>{changesCount}</span> : null}
          </button>
          <button
            className={context.view === "problems" ? styles.viewTabActive : styles.viewTab}
            onClick={() => setWorkbenchView(sessionId, "problems")}
          >
            Problems
            {problemsCount > 0 ? <span className={styles.viewCount}>{problemsCount}</span> : null}
          </button>
        </div>
        <div className={styles.rootLabel} title={primaryRoot ?? undefined}>
          {primaryRoot
            ? projectLabel && projectLabel !== basename(primaryRoot)
              ? `${projectLabel} · ${basename(primaryRoot)}`
              : basename(primaryRoot)
            : "No workspace"}
        </div>
        <div className={styles.addRoot}>
          <button
            className={styles.iconButton}
            onClick={() => setAddOpen((open) => !open)}
            title="Add workspace folder"
            aria-label="Add workspace folder"
            disabled={!primaryRoot}
          >
            +
          </button>
          {addOpen ? (
            <div className={styles.addRootMenu} role="menu">
              {availableProjects.length === 0 ? (
                <span className={styles.addRootEmpty}>All projects added</span>
              ) : (
                availableProjects.map((project) => (
                  <button
                    key={project.path}
                    role="menuitem"
                    className={styles.addRootItem}
                    title={project.path}
                    onClick={() => {
                      addWorkbenchRoot(sessionId, project.path);
                      setAddOpen(false);
                    }}
                  >
                    {project.alias?.trim() || basename(project.path)}
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
        <button
          className={styles.iconButton}
          onClick={() => {
            if (primaryRoot) openTerminalTab(sessionId, primaryRoot);
          }}
          disabled={!primaryRoot}
          title="Open terminal"
        >
          &gt;_
        </button>
        <button
          className={styles.iconButton}
          onClick={() => updateLayout({ navigatorCollapsed: !layout.navigatorCollapsed })}
          title="Toggle navigator"
        >
          ▥
        </button>
        <button className={styles.iconButton} onClick={onClose} title="Hide workbench">×</button>
      </header>

      <div className={styles.body}>
        {!layout.navigatorCollapsed ? (
          <>
            <div className={styles.navigator} style={{ width: layout.navigatorWidth }}>
              {roots.length === 0 ? (
                <p className={styles.treeStatus}>Select a session with a workspace.</p>
              ) : context.view === "files" ? (
                <FileTree
                  key={`files:${sessionId}`}
                  sessionId={sessionId}
                  roots={roots}
                  expanded={context.expanded}
                  gitFilesByRoot={new Map(
                    roots.map((root) => [comparablePath(root), gitByRoot.get(comparablePath(root))?.data?.files ?? []]),
                  )}
                  scrollTop={context.treeScrollTop}
                  onToggle={(path) => toggleExpanded(sessionId, path)}
                  onOpen={(path, preview) => openFileTab(sessionId, path, preview)}
                  onScroll={(scrollTop) => setTreeScroll(sessionId, scrollTop)}
                  onOpenTerminal={(root) => openTerminalTab(sessionId, root)}
                  onRemoveRoot={(root) => {
                    const closed = removeWorkbenchRoot(sessionId, root);
                    for (const id of closed) forgetEditorTab(id);
                  }}
                  onRenamed={(from, to) => {
                    const pairs = renameFileTabs(sessionId, from, to);
                    for (const pair of pairs) renameEditorTab(pair.fromId, pair.toId);
                  }}
                  onDeleted={(path) => {
                    const closed = closeTabsForPath(sessionId, path);
                    for (const id of closed) forgetEditorTab(id);
                  }}
                />
              ) : context.view === "problems" ? (
                <ProblemsList
                  roots={roots}
                  onOpen={(path, line) => openFileTab(sessionId, path, false, { line, column: 1 })}
                />
              ) : (
                roots.map((root) => {
                  const git = gitByRoot.get(comparablePath(root));
                  return (
                    <ChangesList
                      key={`changes:${sessionId}:${root}`}
                      root={root}
                      {...(roots.length > 1 ? { label: basename(root) } : {})}
                      status={git?.data}
                      loading={git?.isLoading ?? false}
                      error={git?.isError ? git.error.message : null}
                      scrollTop={context.changesScrollTop}
                      onOpen={(source) => openDiffTab(sessionId, source)}
                      onRefresh={() => void git?.refetch()}
                      onScroll={(scrollTop) => setChangesScroll(sessionId, scrollTop)}
                    />
                  );
                })
              )}
            </div>
            <ResizeHandle
              label="Resize file navigator"
              onDelta={(delta) => updateLayout({ navigatorWidth: layout.navigatorWidth + delta })}
              onReset={() => updateLayout({ navigatorWidth: 220 })}
            />
          </>
        ) : null}

        <div className={styles.editorArea}>
          <Tabs
            tabs={context.tabs}
            activeTabId={context.activeTabId}
            onActivate={(tabId) => setActiveTab(sessionId, tabId)}
            onClose={(tabId) => closeTab(sessionId, tabId)}
          />
          <div className={styles.editorBody}>
            {activeTab && activeTab.kind !== "terminal" ? renderActive(activeTab) : null}
            {terminalTabs.map((tab) => {
              const visible = tab.id === context.activeTabId;
              return (
                <div
                  key={tab.id}
                  className={styles.terminalArea}
                  style={{ display: visible ? "flex" : "none" }}
                >
                  <Suspense fallback={<div className={styles.editorStatus}>Loading terminal…</div>}>
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
        </div>
      </div>
    </section>
  );
}
