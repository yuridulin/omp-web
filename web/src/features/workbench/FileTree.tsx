import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { comparablePath, dirname, joinPath } from "@/api/paths";
import type { GitFileStatus } from "@/api/workspace";
import { useFileList } from "./use-workbench-data";
import { useFileMutations } from "./use-file-mutations";
import styles from "./file-tree.module.css";

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
  onRenamed?: (from: string, to: string) => void;
  onDeleted?: (path: string) => void;
}

interface TreeOps {
  rename(from: string, to: string): Promise<boolean>;
  remove(path: string, recursive: boolean): Promise<boolean>;
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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  onRenamed,
  onDeleted,
}: FileTreeProps) {
  const treeRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const mutations = useFileMutations(sessionId);
  const [creating, setCreating] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);

  const gitByPath = useMemo(
    () => new Map(gitFiles.map((file) => [comparablePath(file.filePath), file])),
    [gitFiles],
  );

  useEffect(() => {
    if (treeRef.current) treeRef.current.scrollTop = scrollTop;
  }, []);

  const report = (text: string, error = false) => {
    setNotice(text ? { text, error } : null);
  };

  const submitNewFile = async () => {
    const relative = newPath.trim();
    if (!relative) return;
    const target = joinPath(root, relative);
    try {
      await mutations.createFile(target);
      setNewPath("");
      setCreating(false);
      report(`Created ${relative}`);
      onOpen(target, false);
    } catch (error) {
      report(messageOf(error), true);
    }
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const selected = Array.from(files);
    try {
      const result = await mutations.upload(root, selected);
      const parts: string[] = [];
      if (result.uploaded.length > 0) parts.push(`${result.uploaded.length} uploaded`);
      if (result.skipped.length > 0) parts.push(`${result.skipped.length} skipped`);
      if (result.errors.length > 0) parts.push(`${result.errors.length} failed`);
      report(parts.join(", ") || "Nothing uploaded", result.errors.length > 0);
    } catch (error) {
      report(messageOf(error), true);
    }
  };

  const ops: TreeOps = {
    rename: async (from, to) => {
      try {
        await mutations.rename(from, to);
        report(`Renamed to ${to}`);
        return true;
      } catch (error) {
        report(messageOf(error), true);
        return false;
      }
    },
    remove: async (path, recursive) => {
      try {
        await mutations.remove(path, recursive);
        report(`Deleted ${path}`);
        return true;
      } catch (error) {
        report(messageOf(error), true);
        return false;
      }
    },
  };

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <button
          className={styles.toolButton}
          onClick={() => {
            setCreating((value) => !value);
            setNewPath("");
          }}
          title="New file"
        >
          + File
        </button>
        <button
          className={styles.toolButton}
          onClick={() => uploadRef.current?.click()}
          disabled={mutations.pending}
          title="Upload files"
        >
          ↑ Upload
        </button>
        <button
          className={styles.toolButton}
          onClick={() => {
            void queryClient.invalidateQueries({ queryKey: ["file-list"] });
          }}
          title="Refresh"
        >
          ⟳
        </button>
        <input
          ref={uploadRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            const input = event.currentTarget;
            void uploadFiles(input.files).finally(() => {
              input.value = "";
            });
          }}
        />
      </div>
      {creating ? (
        <div className={styles.newFileRow}>
          <input
            className={styles.inlineInput}
            value={newPath}
            autoFocus
            placeholder="path/inside/workspace.ts"
            onChange={(event) => setNewPath(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submitNewFile();
              } else if (event.key === "Escape") {
                setCreating(false);
                setNewPath("");
              }
            }}
          />
          <button className={styles.inlineButton} onClick={() => void submitNewFile()}>Create</button>
          <button
            className={styles.inlineButton}
            onClick={() => {
              setCreating(false);
              setNewPath("");
            }}
          >
            Cancel
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className={notice.error ? styles.noticeError : styles.notice}>{notice.text}</div>
      ) : null}
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
          ops={ops}
          {...(onRenamed ? { onRenamed } : {})}
          {...(onDeleted ? { onDeleted } : {})}
        />
      </div>
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
  ops: TreeOps;
  onRenamed?: (from: string, to: string) => void;
  onDeleted?: (path: string) => void;
}

function DirectoryList({
  path,
  depth,
  sessionId,
  expanded,
  gitByPath,
  onToggle,
  onOpen,
  ops,
  onRenamed,
  onDeleted,
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
              <TreeRow
                fullPath={fullPath}
                name={entry.name}
                isDir
                open={open}
                depth={depth}
                onToggle={onToggle}
                onOpen={onOpen}
                ops={ops}
                {...(onRenamed ? { onRenamed } : {})}
                {...(onDeleted ? { onDeleted } : {})}
              />
              {open ? (
                <DirectoryList
                  path={fullPath}
                  depth={depth + 1}
                  sessionId={sessionId}
                  expanded={expanded}
                  gitByPath={gitByPath}
                  onToggle={onToggle}
                  onOpen={onOpen}
                  ops={ops}
                  {...(onRenamed ? { onRenamed } : {})}
                  {...(onDeleted ? { onDeleted } : {})}
                />
              ) : null}
            </Fragment>
          );
        }
        const status = gitByPath.get(comparablePath(fullPath));
        return (
          <TreeRow
            key={fullPath}
            fullPath={fullPath}
            name={entry.name}
            isDir={false}
            depth={depth}
            onToggle={onToggle}
            onOpen={onOpen}
            ops={ops}
            {...(status ? { status } : {})}
            {...(onRenamed ? { onRenamed } : {})}
            {...(onDeleted ? { onDeleted } : {})}
          />
        );
      })}
      {entries.length > MAX_ENTRIES ? (
        <div className={styles.treeStatus}>Showing first {MAX_ENTRIES} of {entries.length}</div>
      ) : null}
    </>
  );
}

type RowMode = "idle" | "rename" | "confirm";

interface TreeRowProps {
  fullPath: string;
  name: string;
  isDir: boolean;
  open?: boolean;
  status?: GitFileStatus;
  depth: number;
  onToggle: (path: string) => void;
  onOpen: (path: string, preview: boolean) => void;
  ops: TreeOps;
  onRenamed?: (from: string, to: string) => void;
  onDeleted?: (path: string) => void;
}

function TreeRow({
  fullPath,
  name,
  isDir,
  open = false,
  status,
  depth,
  onToggle,
  onOpen,
  ops,
  onRenamed,
  onDeleted,
}: TreeRowProps) {
  const [mode, setMode] = useState<RowMode>("idle");
  const [draftName, setDraftName] = useState(name);
  const [busy, setBusy] = useState(false);
  const indent = { paddingLeft: 6 + depth * 12 };

  const startRename = () => {
    setDraftName(name);
    setMode("rename");
  };

  const submitRename = async () => {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === name) {
      setMode("idle");
      return;
    }
    const target = joinPath(dirname(fullPath), trimmed);
    setBusy(true);
    const ok = await ops.rename(fullPath, target);
    setBusy(false);
    if (ok) {
      onRenamed?.(fullPath, target);
      setMode("idle");
    }
  };

  const submitDelete = async () => {
    setBusy(true);
    const ok = await ops.remove(fullPath, isDir);
    setBusy(false);
    if (ok) {
      onDeleted?.(fullPath);
      setMode("idle");
    }
  };

  if (mode === "rename") {
    return (
      <div className={styles.treeRow} style={indent}>
        <input
          className={styles.inlineInput}
          value={draftName}
          autoFocus
          disabled={busy}
          aria-label={`Rename ${name}`}
          onChange={(event) => setDraftName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void submitRename();
            } else if (event.key === "Escape") {
              setMode("idle");
            }
          }}
        />
        <button className={styles.inlineButton} onClick={() => void submitRename()} disabled={busy}>✓</button>
        <button className={styles.inlineButton} onClick={() => setMode("idle")} disabled={busy}>×</button>
      </div>
    );
  }

  if (mode === "confirm") {
    return (
      <div className={`${styles.treeRow} ${styles.confirmRow}`} style={indent}>
        <span className={styles.confirmText} title={fullPath}>
          Delete {name}{isDir ? " (directory)" : ""}?
        </span>
        <button className={styles.inlineButton} onClick={() => void submitDelete()} disabled={busy}>Delete</button>
        <button className={styles.inlineButton} onClick={() => setMode("idle")} disabled={busy}>Cancel</button>
      </div>
    );
  }

  return (
    <div className={styles.treeRow} style={indent}>
      <button
        className={styles.treeMain}
        onClick={() => (isDir ? onToggle(fullPath) : onOpen(fullPath, true))}
        onDoubleClick={() => {
          if (!isDir) onOpen(fullPath, false);
        }}
        title={status ? `${fullPath} (${status.status})` : fullPath}
      >
        <span className={isDir ? styles.treeChevron : styles.treeFileMark}>{isDir ? (open ? "▾" : "▸") : "·"}</span>
        <span className={styles.treeName}>{name}</span>
        {status ? <span className={`${styles.badge} ${badgeClass(status)}`}>{status.code}</span> : null}
      </button>
      <span className={styles.treeActions}>
        <button className={styles.rowAction} onClick={startRename} title={`Rename ${name}`}>✎</button>
        <button className={styles.rowAction} onClick={() => setMode("confirm")} title={`Delete ${name}`}>×</button>
      </span>
    </div>
  );
}
