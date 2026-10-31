import { useMemo, useState } from "react";
import { basename, comparablePath } from "@/api/paths";
import { writeDragPayload } from "@/drag/payload";
import { EditorArea } from "@/features/workbench/EditorArea";
import { FileTree } from "@/features/workbench/FileTree";
import { ProblemsList } from "@/features/workbench/ProblemsList";
import { ResizeHandle } from "@/layout/ResizeHandle";
import type { FilesSlotProps } from "@/slots/files";
import { Tabs } from "./Tabs";
import styles from "./files.module.css";

export function FilesSkin({
  sessionId,
  primaryRoot,
  projectLabel,
  roots,
  view,
  expanded,
  tabs,
  activeTabId,
  treeScrollTop,
  changesScrollTop,
  navigatorWidth,
  navigatorCollapsed,
  gitByRoot,
  problems,
  availableProjects,
  ChangesView,
  onClose,
  onSelectView,
  onToggleExpanded,
  onOpenFile,
  onOpenFileAt,
  onOpenTerminal,
  onAddRoot,
  onRemoveRoot,
  onRenamed,
  onDeleted,
  onTreeScroll,
  onChangesScroll,
  onRefreshGit,
  onOpenDiff,
  onActivateTab,
  onCloseTab,
  onTabScroll,
  onToggleNavigator,
  onResizeNavigator,
  onResetNavigator,
  onInlinePrompt,
}: FilesSlotProps) {
  const [addOpen, setAddOpen] = useState(false);

  const gitFilesByRoot = useMemo(
    () => new Map(
      roots.map((root) => [comparablePath(root), gitByRoot.get(comparablePath(root))?.status?.files ?? []]),
    ),
    [gitByRoot, roots],
  );
  const changesCount = useMemo(
    () => roots.reduce((total, root) => total + (gitByRoot.get(comparablePath(root))?.status?.files.length ?? 0), 0),
    [gitByRoot, roots],
  );
  const problemsCount = problems.reduce((total, document) => total + document.diagnostics.length, 0);

  const renderNavigator = () => {
    if (roots.length === 0) {
      return <p className={styles.treeStatus}>Select a session with a workspace.</p>;
    }
    if (view === "files") {
      return (
        <FileTree
          key={`files:${sessionId}`}
          sessionId={sessionId}
          roots={roots}
          expanded={expanded}
          gitFilesByRoot={gitFilesByRoot}
          scrollTop={treeScrollTop}
          onToggle={onToggleExpanded}
          onOpen={onOpenFile}
          onScroll={onTreeScroll}
          onDragStartFile={(event, path, root) => {
            writeDragPayload(event.dataTransfer, { kind: "file", path, root });
          }}
          onOpenTerminal={onOpenTerminal}
          onRemoveRoot={onRemoveRoot}
          onRenamed={onRenamed}
          onDeleted={onDeleted}
        />
      );
    }
    if (view === "problems") {
      return <ProblemsList documents={problems} onOpen={(path, line) => onOpenFileAt(path, line, 1)} />;
    }
    return (
      <>
        {roots.map((root) => {
          const git = gitByRoot.get(comparablePath(root));
          return (
            <ChangesView
              key={`changes:${sessionId}:${root}`}
              root={root}
              {...(roots.length > 1 ? { label: basename(root) } : {})}
              status={git?.status}
              loading={git?.loading ?? false}
              error={git?.error ?? null}
              scrollTop={changesScrollTop}
              onOpen={onOpenDiff}
              onRefresh={() => onRefreshGit(root)}
              onScroll={onChangesScroll}
            />
          );
        })}
      </>
    );
  };

  return (
    <section className={styles.workbench}>
      <header className={styles.header}>
        <div className={styles.viewTabs}>
          <button
            className={view === "files" ? styles.viewTabActive : styles.viewTab}
            onClick={() => onSelectView("files")}
          >
            Files
          </button>
          <button
            className={view === "changes" ? styles.viewTabActive : styles.viewTab}
            onClick={() => onSelectView("changes")}
          >
            Changes
            {changesCount > 0 ? <span className={styles.viewCount}>{changesCount}</span> : null}
          </button>
          <button
            className={view === "problems" ? styles.viewTabActive : styles.viewTab}
            onClick={() => onSelectView("problems")}
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
                      onAddRoot(project.path);
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
            if (primaryRoot) onOpenTerminal(primaryRoot);
          }}
          disabled={!primaryRoot}
          title="Open terminal"
        >
          &gt;_
        </button>
        <button
          className={styles.iconButton}
          onClick={onToggleNavigator}
          title="Toggle navigator"
        >
          ▥
        </button>
        <button className={styles.iconButton} onClick={onClose} title="Hide workbench">×</button>
      </header>

      <div className={styles.body}>
        {!navigatorCollapsed ? (
          <>
            <div className={styles.navigator} style={{ width: navigatorWidth }}>
              {renderNavigator()}
            </div>
            <ResizeHandle
              label="Resize file navigator"
              onDelta={onResizeNavigator}
              onReset={onResetNavigator}
            />
          </>
        ) : null}

        <div className={styles.editorArea}>
          <Tabs
            tabs={tabs}
            activeTabId={activeTabId}
            onActivate={onActivateTab}
            onClose={onCloseTab}
          />
          <EditorArea
            sessionId={sessionId}
            primaryRoot={primaryRoot}
            roots={roots}
            tabs={tabs}
            activeTabId={activeTabId}
            onTabScroll={onTabScroll}
            {...(onInlinePrompt ? { onInlinePrompt } : {})}
          />
        </div>
      </div>
    </section>
  );
}
