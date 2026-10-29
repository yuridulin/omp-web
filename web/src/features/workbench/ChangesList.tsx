import { useEffect, useMemo, useRef } from "react";
import { relativePath } from "@/api/paths";
import type { DiffTabSource } from "@/layout/layout-store";
import type { GitFileStatus, GitStatus } from "@/api/workspace";
import styles from "./workbench.module.css";

interface ChangesListProps {
  root: string;
  status: GitStatus | undefined;
  loading: boolean;
  error: string | null;
  scrollTop: number;
  onOpen: (source: DiffTabSource) => void;
  onRefresh: () => void;
  onScroll: (scrollTop: number) => void;
}

interface ChangeGroup {
  id: string;
  label: string;
  files: GitFileStatus[];
}

export function diffSourceFor(file: GitFileStatus, root: string): DiffTabSource {
  const untracked = file.indexStatus === "?";
  const staged = !untracked && file.indexStatus !== " ";
  const unstaged = !untracked && file.worktreeStatus !== " ";
  let from = "HEAD";
  let to = "WORKTREE";
  if (untracked) {
    from = "EMPTY";
  } else if (staged && !unstaged) {
    to = "INDEX";
  } else if (!staged && unstaged) {
    from = "INDEX";
  }
  if (file.status === "deleted") to = "EMPTY";
  return {
    kind: "working",
    cwd: root,
    path: file.filePath,
    ...(file.originalPath ? { oldPath: file.originalPath } : {}),
    from,
    to,
  };
}

export function groupChanges(status: GitStatus | undefined): ChangeGroup[] {
  const files = status?.files ?? [];
  const conflicts = files.filter((file) => file.status === "conflict");
  const untracked = files.filter((file) => file.indexStatus === "?");
  const staged = files.filter((file) => file.status !== "conflict" && file.indexStatus !== " " && file.indexStatus !== "?");
  const unstaged = files.filter((file) => file.status !== "conflict" && file.indexStatus !== "?" && file.worktreeStatus !== " ");
  return [
    { id: "conflicts", label: "Conflicts", files: conflicts },
    { id: "staged", label: "Staged", files: staged },
    { id: "unstaged", label: "Unstaged", files: unstaged },
    { id: "untracked", label: "Untracked", files: untracked },
  ].filter((group) => group.files.length > 0);
}

function statusLetter(file: GitFileStatus): string {
  if (file.status === "conflict") return "!";
  if (file.status === "untracked") return "U";
  return file.code;
}

function statusClass(file: GitFileStatus): string {
  switch (file.status) {
    case "added": return styles.badgeAdded ?? "";
    case "deleted": return styles.badgeDeleted ?? "";
    case "conflict": return styles.badgeConflict ?? "";
    case "renamed": return styles.badgeRenamed ?? "";
    case "untracked": return styles.badgeUntracked ?? "";
    default: return styles.badgeModified ?? "";
  }
}

export function ChangesList({
  root,
  status,
  loading,
  error,
  scrollTop,
  onOpen,
  onRefresh,
  onScroll,
}: ChangesListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => groupChanges(status), [status]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = scrollTop;
  }, []);

  return (
    <div className={styles.changes}>
      <div className={styles.changesHeader}>
        <span className={styles.changesCount}>
          {status?.isGitRepository ? `${status.files.length} changed` : "not a git repo"}
        </span>
        <button className={styles.smallButton} onClick={onRefresh} title="Refresh git status">↻</button>
      </div>
      <div className={styles.changesScroll} ref={listRef} onScroll={(event) => onScroll(event.currentTarget.scrollTop)}>
        {loading && !status ? <p className={styles.treeStatus}>Loading…</p> : null}
        {error ? <p className={styles.treeError}>{error}</p> : null}
        {status && !status.isGitRepository ? <p className={styles.treeStatus}>Not a git repository.</p> : null}
        {status?.isGitRepository && groups.length === 0 ? <p className={styles.treeStatus}>Working tree clean.</p> : null}
        {groups.map((group) => (
          <section key={group.id} className={styles.changeGroup}>
            <div className={styles.changeGroupLabel}>{group.label} <span>{group.files.length}</span></div>
            {group.files.map((file) => (
              <button
                key={`${group.id}:${file.filePath}`}
                className={styles.changeRow}
                onClick={() => onOpen(diffSourceFor(file, root))}
                title={file.filePath}
              >
                <span className={`${styles.badge} ${statusClass(file)}`}>{statusLetter(file)}</span>
                <span className={styles.changePath}>{relativePath(file.filePath, root)}</span>
                {file.collapseReason ? <span className={styles.changeReason}>{file.collapseReason}</span> : null}
              </button>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
