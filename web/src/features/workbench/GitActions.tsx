import { useState } from "react";
import type { GitStatus } from "@/api/workspace";
import { useGitBranches } from "./use-git-write";
import styles from "./git-actions.module.css";

export interface GitActionsProps {
  root: string;
  status: GitStatus | undefined;
  pending: boolean;
  error: string | null;
  onStageAll(): void;
  onUnstageAll(): void;
  onCommit(message: string, amend: boolean): Promise<void>;
  onCheckout(branch: string): Promise<void>;
  onCreateBranch(name: string): Promise<void>;
}

function stagedCount(status: GitStatus | undefined): number {
  return (status?.files ?? []).filter(
    (file) => file.status !== "conflict" && file.indexStatus !== " " && file.indexStatus !== "?",
  ).length;
}

export function GitActions({
  root,
  status,
  pending,
  error,
  onStageAll,
  onUnstageAll,
  onCommit,
  onCheckout,
  onCreateBranch,
}: GitActionsProps) {
  const branches = useGitBranches(root);
  const [message, setMessage] = useState("");
  const [amend, setAmend] = useState(false);
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [branchName, setBranchName] = useState("");

  const current = branches.data?.current ?? null;
  const branchList = branches.data?.branches ?? [];
  const changedCount = status?.isGitRepository ? status.files.length : 0;
  const staged = stagedCount(status);
  const trimmed = message.trim();
  const canCommit = !pending && trimmed.length > 0;

  const submit = async () => {
    if (!canCommit) return;
    try {
      await onCommit(trimmed, amend);
      setMessage("");
    } catch {
      // The caller owns the error state; keep the draft for a retry.
    }
  };

  const submitBranch = async () => {
    const name = branchName.trim();
    if (!name || pending) return;
    try {
      await onCreateBranch(name);
      setBranchName("");
      setCreatingBranch(false);
    } catch {
      // Keep the input open so the name can be corrected.
    }
  };

  return (
    <div className={styles.actions}>
      <div className={styles.row}>
        <span className={styles.label}>Branch</span>
        <select
          className={styles.branchSelect}
          aria-label="Branch"
          value={current ?? ""}
          disabled={pending || branches.isLoading}
          onChange={(event) => {
            const branch = event.currentTarget.value;
            if (!branch || branch === current) return;
            void onCheckout(branch).catch(() => {});
          }}
        >
          {current === null ? (
            <option value="">{branches.isLoading ? "Loading…" : "Detached"}</option>
          ) : null}
          {current !== null && !branchList.some((branch) => branch.name === current) ? (
            <option value={current}>{current}</option>
          ) : null}
          {branchList.map((branch) => (
            <option key={branch.name} value={branch.name}>
              {branch.current ? `${branch.name} (current)` : branch.name}
            </option>
          ))}
        </select>
        {creatingBranch ? (
          <input
            className={styles.branchInput}
            aria-label="New branch name"
            placeholder="new-branch"
            value={branchName}
            disabled={pending}
            autoFocus
            onChange={(event) => setBranchName(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submitBranch();
              } else if (event.key === "Escape") {
                event.preventDefault();
                setBranchName("");
                setCreatingBranch(false);
              }
            }}
          />
        ) : (
          <button
            className={styles.ghostButton}
            onClick={() => setCreatingBranch(true)}
            disabled={pending}
            title="Create and check out a branch"
          >
            New branch
          </button>
        )}
      </div>

      <div className={styles.row}>
        <button
          className={styles.ghostButton}
          onClick={onStageAll}
          disabled={pending || changedCount === 0}
          title="Stage every change"
        >
          Stage all
        </button>
        <button
          className={styles.ghostButton}
          onClick={onUnstageAll}
          disabled={pending || staged === 0}
          title="Unstage everything"
        >
          Unstage all
        </button>
        <span className={styles.meta}>
          {status === undefined
            ? "…"
            : status.isGitRepository
              ? `${changedCount} changed · ${staged} staged`
              : "not a git repo"}
        </span>
      </div>

      <textarea
        className={styles.commitMessage}
        aria-label="Commit message"
        placeholder="Commit message"
        rows={2}
        value={message}
        disabled={pending}
        onChange={(event) => setMessage(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void submit();
          }
        }}
      />

      <div className={styles.row}>
        <label className={styles.amend}>
          <input
            type="checkbox"
            checked={amend}
            disabled={pending}
            onChange={(event) => setAmend(event.currentTarget.checked)}
          />
          Amend
        </label>
        <span className={styles.hint}>{pending ? "Working…" : "Ctrl/Cmd+Enter to commit"}</span>
        <button className={styles.primaryButton} onClick={() => void submit()} disabled={!canCommit}>
          Commit
        </button>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {!error && branches.isError ? <p className={styles.error}>{branches.error.message}</p> : null}
    </div>
  );
}
