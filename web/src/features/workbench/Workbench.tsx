import { basename } from "@/api/paths";
import { ResizeHandle } from "@/layout/ResizeHandle";
import {
  closeTab,
  openDiffTab,
  openFileTab,
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
import { useGitStatus } from "./use-workbench-data";
import { ChangesList } from "./ChangesList";
import { DiffView } from "./DiffView";
import { FileTree } from "./FileTree";
import { FileView } from "./FileView";
import { Tabs } from "./Tabs";
import styles from "./workbench.module.css";

interface WorkbenchProps {
  sessionId: string;
  root: string | null;
  projectLabel: string;
  onClose: () => void;
}

export function Workbench({ sessionId, root, projectLabel, onClose }: WorkbenchProps) {
  const layout = useLayout();
  const context = useWorkbench(sessionId);
  const git = useGitStatus(root);
  const activeTab = context.tabs.find((tab) => tab.id === context.activeTabId) ?? null;
  const changesCount = git.data?.files.length ?? 0;

  const renderActive = (tab: WorkbenchTab) => {
    if (tab.kind === "file") {
      return (
        <FileView
          key={tab.id}
          path={tab.path}
          sessionId={sessionId}
          {...(tab.scrollTop !== undefined ? { scrollTop: tab.scrollTop } : {})}
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
        </div>
        <div className={styles.rootLabel} title={root ?? undefined}>
          {root
            ? projectLabel && projectLabel !== basename(root)
              ? `${projectLabel} · ${basename(root)}`
              : basename(root)
            : "No workspace"}
        </div>
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
              {!root ? (
                <p className={styles.treeStatus}>Select a session with a workspace.</p>
              ) : context.view === "files" ? (
                <FileTree
                  key={`files:${sessionId}:${root}`}
                  sessionId={sessionId}
                  root={root}
                  expanded={context.expanded}
                  gitFiles={git.data?.files ?? []}
                  scrollTop={context.treeScrollTop}
                  onToggle={(path) => toggleExpanded(sessionId, path)}
                  onOpen={(path, preview) => openFileTab(sessionId, path, preview)}
                  onScroll={(scrollTop) => setTreeScroll(sessionId, scrollTop)}
                />
              ) : (
                <ChangesList
                  key={`changes:${sessionId}:${root}`}
                  root={root}
                  status={git.data}
                  loading={git.isLoading}
                  error={git.isError ? git.error.message : null}
                  scrollTop={context.changesScrollTop}
                  onOpen={(source) => openDiffTab(sessionId, source)}
                  onRefresh={() => void git.refetch()}
                  onScroll={(scrollTop) => setChangesScroll(sessionId, scrollTop)}
                />
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
            {activeTab ? renderActive(activeTab) : (
              <div className={styles.empty}>
                <p>{root ? "Open a file from the tree." : "No workspace root."}</p>
                <p className={styles.muted}>Files and diffs stay attached to this session.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
