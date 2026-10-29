import { Fragment, useEffect, useMemo, useRef } from "react";
import { comparablePath, joinPath } from "@/api/paths";
import type { GitFileStatus } from "@/api/workspace";
import { useFileList } from "./use-workbench-data";
import styles from "./workbench.module.css";

const MAX_ENTRIES = 500;

interface FileTreeProps {
  sessionId: string;
  root: string;
  expanded: string[];
  gitFiles: GitFileStatus[];
  scrollTop: number;
  onToggle: (path: string) => void;
  onOpen: (path: string, preview: boolean) => void;
  onScroll: (scrollTop: number) => void;
}

function badgeClass(status: GitFileStatus): string {
  switch (status.status) {
    case "added": return styles.badgeAdded ?? "";
    case "deleted": return styles.badgeDeleted ?? "";
    case "conflict": return styles.badgeConflict ?? "";
    case "renamed": return styles.badgeRenamed ?? "";
    case "untracked": return styles.badgeUntracked ?? "";
    default: return styles.badgeModified ?? "";
  }
}

export function FileTree({
  sessionId,
  root,
  expanded,
  gitFiles,
  scrollTop,
  onToggle,
  onOpen,
  onScroll,
}: FileTreeProps) {
  const treeRef = useRef<HTMLDivElement>(null);
  const gitByPath = useMemo(
    () => new Map(gitFiles.map((file) => [comparablePath(file.filePath), file])),
    [gitFiles],
  );

  useEffect(() => {
    if (treeRef.current) treeRef.current.scrollTop = scrollTop;
  }, []);

  return (
    <div
      className={styles.tree}
      ref={treeRef}
      onScroll={(event) => onScroll(event.currentTarget.scrollTop)}
    >
      <DirectoryList
        path={root}
        depth={0}
        sessionId={sessionId}
        expanded={expanded}
        gitByPath={gitByPath}
        onToggle={onToggle}
        onOpen={onOpen}
      />
    </div>
  );
}

interface DirectoryListProps {
  path: string;
  depth: number;
  sessionId: string;
  expanded: string[];
  gitByPath: Map<string, GitFileStatus>;
  onToggle: (path: string) => void;
  onOpen: (path: string, preview: boolean) => void;
}

function DirectoryList({
  path,
  depth,
  sessionId,
  expanded,
  gitByPath,
  onToggle,
  onOpen,
}: DirectoryListProps) {
  const query = useFileList(path, sessionId);
  if (query.isLoading) return <div className={styles.treeStatus}>Loading…</div>;
  if (query.isError) return <div className={styles.treeError}>{query.error.message}</div>;
  const entries = query.data?.entries ?? [];
  if (entries.length === 0) return <div className={styles.treeStatus}>empty</div>;

  return (
    <>
      {entries.slice(0, MAX_ENTRIES).map((entry) => {
        const fullPath = joinPath(path, entry.name);
        if (entry.isDir) {
          const open = expanded.includes(fullPath);
          return (
            <Fragment key={fullPath}>
              <button
                className={styles.treeRow}
                style={{ paddingLeft: 6 + depth * 12 }}
                onClick={() => onToggle(fullPath)}
                title={fullPath}
              >
                <span className={styles.treeChevron}>{open ? "▾" : "▸"}</span>
                <span className={styles.treeName}>{entry.name}</span>
              </button>
              {open ? (
                <DirectoryList
                  path={fullPath}
                  depth={depth + 1}
                  sessionId={sessionId}
                  expanded={expanded}
                  gitByPath={gitByPath}
                  onToggle={onToggle}
                  onOpen={onOpen}
                />
              ) : null}
            </Fragment>
          );
        }
        const status = gitByPath.get(comparablePath(fullPath));
        return (
          <button
            key={fullPath}
            className={styles.treeRow}
            style={{ paddingLeft: 6 + depth * 12 }}
            onClick={() => onOpen(fullPath, true)}
            onDoubleClick={() => onOpen(fullPath, false)}
            title={status ? `${fullPath} (${status.status})` : fullPath}
          >
            <span className={styles.treeFileMark}>·</span>
            <span className={styles.treeName}>{entry.name}</span>
            {status ? <span className={`${styles.badge} ${badgeClass(status)}`}>{status.code}</span> : null}
          </button>
        );
      })}
      {entries.length > MAX_ENTRIES ? (
        <div className={styles.treeStatus}>Showing first {MAX_ENTRIES} of {entries.length}</div>
      ) : null}
    </>
  );
}
