import { useEffect, useMemo, useRef } from "react";
import { relativePath } from "@/api/paths";
import type { DiffTabSource } from "@/layout/layout-store";
import type { GitFileStatus, GitStatus } from "@/api/workspace";
import type { ChangesSlotProps } from "@/slots/changes";
import { GitActions } from "./GitActions";
import styles from "./changes-list.module.css";
import gitStyles from "./git-actions.module.css";

export interface ChangeGroup {
  id: string;
  label: string;
  files: GitFileStatus[];
}

export interface ChangeGroupTargets {
  stage: string[];
  unstage: string[];
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

/** Which bulk action a group supports; conflicted files stage to mark resolution. */
export function groupActionTargets(group: ChangeGroup): ChangeGroupTargets {
  const paths = group.files.map((file) => file.filePath);
  switch (group.id) {
    case "staged":
      return { stage: [], unstage: paths };
    case "conflicts":
    case "unstaged":
    case "untracked":
      return { stage: paths, unstage: [] };
    default:
      return { stage: [], unstage: [] };
  }
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
  label,
  status,
  loading,
  error,
  scrollTop,
  pending,
  writeError,
  branches,
  currentBranch,
  branchesLoading,
  branchesError,
  onOpen,
  onRefresh,
  onScroll,
  onStage,
  onUnstage,
  onStageAll,
  onUnstageAll,
  onCommit,
  onCheckout,
  onCreateBranch,
}: ChangesSlotProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => groupChanges(status), [status]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = scrollTop;
  }, []);

  const stagePaths = (paths: string[]) => {
    if (paths.length === 0) return;
    onStage(paths);
  };

  const unstagePaths = (paths: string[]) => {
    if (paths.length === 0) return;
    onUnstage(paths);
  };

  return (
    <div className={styles.changes}>
      <div className={styles.changesHeader}>
        {label ? <span className={styles.changesLabel} title={root}>{label}</span> : null}
        <span className={styles.changesCount}>
          {status?.isGitRepository ? `${status.files.length} changed` : "not a git repo"}
        </span>
        <button className={styles.smallButton} onClick={onRefresh} title="Refresh git status">↻</button>
      </div>
      {status?.isGitRepository === false ? null : (
        <div className={gitStyles.actionsBar}>
          <GitActions
            status={status}
            pending={pending}
            error={writeError}
            branches={branches}
            currentBranch={currentBranch}
            branchesLoading={branchesLoading}
            branchesError={branchesError}
            onStageAll={onStageAll}
            onUnstageAll={onUnstageAll}
            onCommit={onCommit}
            onCheckout={onCheckout}
            onCreateBranch={onCreateBranch}
          />
        </div>
      )}
      <div className={styles.changesScroll} ref={listRef} onScroll={(event) => onScroll(event.currentTarget.scrollTop)}>
        {loading && !status ? <p className={styles.treeStatus}>Loading…</p> : null}
        {error ? <p className={styles.treeError}>{error}</p> : null}
        {status && !status.isGitRepository ? <p className={styles.treeStatus}>Not a git repository.</p> : null}
        {status?.isGitRepository && groups.length === 0 ? <p className={styles.treeStatus}>Working tree clean.</p> : null}
        {groups.map((group) => {
          const targets = groupActionTargets(group);
          const rowAction = group.id === "staged" ? "unstage" : "stage";
          return (
            <section key={group.id} className={styles.changeGroup}>
              <div className={styles.changeGroupLabel}>
                <span className={gitStyles.groupTitle}>
                  {group.label} <span>{group.files.length}</span>
                </span>
                <span className={gitStyles.groupActions}>
                  {targets.stage.length > 0 ? (
                    <button
                      className={gitStyles.miniButton}
                      disabled={pending}
                      onClick={() => stagePaths(targets.stage)}
                      title={`Stage all ${targets.stage.length} file(s) in ${group.label}`}
                    >
                      Stage all
                    </button>
                  ) : null}
                  {targets.unstage.length > 0 ? (
                    <button
                      className={gitStyles.miniButton}
                      disabled={pending}
                      onClick={() => unstagePaths(targets.unstage)}
                      title={`Unstage all ${targets.unstage.length} file(s) in ${group.label}`}
                    >
                      Unstage all
                    </button>
                  ) : null}
                </span>
              </div>
              {group.files.map((file) => (
                <div key={`${group.id}:${file.filePath}`} className={styles.changeRow}>
                  <button
                    className={gitStyles.changeOpen}
                    onClick={() => onOpen(diffSourceFor(file, root))}
                    title={file.filePath}
                  >
                    <span className={`${styles.badge} ${statusClass(file)}`}>{statusLetter(file)}</span>
                    <span className={styles.changePath}>{relativePath(file.filePath, root)}</span>
                    {file.collapseReason ? <span className={styles.changeReason}>{file.collapseReason}</span> : null}
                  </button>
                  <button
                    className={gitStyles.miniButton}
                    disabled={pending}
                    onClick={() => {
                      if (rowAction === "stage") stagePaths([file.filePath]);
                      else unstagePaths([file.filePath]);
                    }}
                    title={`${rowAction === "stage" ? "Stage" : "Unstage"} ${relativePath(file.filePath, root)}`}
                  >
                    {rowAction === "stage" ? "Stage" : "Unstage"}
                  </button>
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
