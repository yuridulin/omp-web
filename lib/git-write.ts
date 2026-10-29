import { isAbsolute, relative, resolve, sep } from "node:path";
import { getGitStatus } from "./git-changes";
import type { GitStatusResponse } from "./git-types";
import { createChildProcessEnvironment } from "./project-command-env";

/**
 * Git mutations for the workspace domain: stage, unstage, commit, branch,
 * checkout. Reads stay in `git-changes.ts`; this module is the write side and
 * never trusts a client path or branch name.
 */

const GIT_TIMEOUT_MS = 15_000;
const MAX_GIT_OUTPUT = 8 * 1024 * 1024;

export class GitWriteError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "GitWriteError";
    this.code = code;
    this.status = status;
  }
}

function classifyGitError(message: string, timedOut: boolean): GitWriteError {
  if (timedOut) return new GitWriteError("git command timed out", "git_timeout", 504);
  const lower = message.toLowerCase();
  if (lower.includes("not a git repository")) {
    return new GitWriteError(message, "not_a_git_repository", 400);
  }
  if (lower.includes("please tell me who you are") || lower.includes("unable to auto-detect email")) {
    return new GitWriteError(message, "git_identity_missing", 400);
  }
  if (lower.includes("nothing to commit") || lower.includes("no changes added to commit")) {
    return new GitWriteError(message, "nothing_to_commit", 409);
  }
  if (lower.includes("already exists")) {
    return new GitWriteError(message, "branch_already_exists", 409);
  }
  if (lower.includes("would be overwritten") || lower.includes("local changes")) {
    return new GitWriteError(message, "checkout_conflict", 409);
  }
  if (lower.includes("not a valid branch name") || lower.includes("invalid branch name")) {
    return new GitWriteError(message, "invalid_branch_name", 400);
  }
  return new GitWriteError(message, "git_command_failed", 500);
}

async function readLimited(stream: ReadableStream<Uint8Array> | undefined): Promise<string> {
  if (!stream) return "";
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_GIT_OUTPUT) {
      await reader.cancel().catch(() => {});
      throw new GitWriteError("git output exceeded the limit", "git_output_too_large", 413);
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

async function runGit(cwd: string, args: string[], input?: string): Promise<string> {
  const proc = Bun.spawn(["git", "-C", cwd, ...args], {
    stdin: input === undefined ? "ignore" : new TextEncoder().encode(input),
    stdout: "pipe",
    stderr: "pipe",
    env: createChildProcessEnvironment({ LC_ALL: "C", GIT_TERMINAL_PROMPT: "0" }),
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, GIT_TIMEOUT_MS);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      readLimited(proc.stdout),
      readLimited(proc.stderr),
      proc.exited,
    ]);
    if (exitCode !== 0) {
      throw classifyGitError(stderr.trim() || stdout.trim() || `git ${args[0]} failed`, timedOut);
    }
    return stdout;
  } finally {
    clearTimeout(timer);
  }
}

async function repositoryRoot(cwd: string): Promise<string> {
  return (await runGit(cwd, ["rev-parse", "--show-toplevel"])).trim();
}

/** Repo-relative POSIX paths; absolute paths and `..` escapes are rejected. */
function repositoryPaths(root: string, cwd: string, paths: readonly string[] | undefined): string[] {
  const values = paths ?? [];
  if (values.length === 0) {
    throw new GitWriteError("paths or all is required", "paths_required", 400);
  }
  return values.map((value) => {
    if (!value || value.includes("\0") || isAbsolute(value)) {
      throw new GitWriteError(`Invalid repository path: ${value}`, "invalid_path", 400);
    }
    const absolute = resolve(cwd, value);
    const rel = relative(root, absolute);
    if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new GitWriteError(`Path is outside the repository: ${value}`, "path_outside_repository", 400);
    }
    return rel.split(sep).join("/");
  });
}

export interface StageOptions {
  paths?: readonly string[];
  all?: boolean;
}

export async function stageChanges(cwd: string, options: StageOptions): Promise<GitStatusResponse> {
  const root = await repositoryRoot(cwd);
  if (options.all) {
    await runGit(root, ["add", "--all"]);
  } else {
    await runGit(root, ["add", "--", ...repositoryPaths(root, cwd, options.paths)]);
  }
  return getGitStatus(root);
}

export async function unstageChanges(cwd: string, options: StageOptions): Promise<GitStatusResponse> {
  const root = await repositoryRoot(cwd);
  let hasHead = true;
  try {
    await runGit(root, ["rev-parse", "--verify", "--quiet", "HEAD"]);
  } catch {
    hasHead = false;
  }
  if (options.all) {
    if (hasHead) {
      await runGit(root, ["reset", "-q", "HEAD"]);
    } else {
      await runGit(root, ["rm", "--cached", "-r", "."]);
    }
    return getGitStatus(root);
  }
  const paths = repositoryPaths(root, cwd, options.paths);
  if (hasHead) {
    await runGit(root, ["reset", "-q", "HEAD", "--", ...paths]);
  } else {
    await runGit(root, ["rm", "--cached", "-r", "--", ...paths]);
  }
  return getGitStatus(root);
}

export interface CommitOptions {
  message: string;
  amend?: boolean;
  paths?: readonly string[];
}

export interface CommitResult {
  commit: string;
  status: GitStatusResponse;
}

export async function commitChanges(cwd: string, options: CommitOptions): Promise<CommitResult> {
  const message = options.message.trim();
  if (!message) throw new GitWriteError("Commit message is required", "commit_message_required", 400);
  const root = await repositoryRoot(cwd);
  const args = ["commit", "-m", message];
  if (options.amend) args.push("--amend");
  if (options.paths && options.paths.length > 0) {
    args.push("--", ...repositoryPaths(root, cwd, options.paths));
  }
  await runGit(root, args);
  const commit = (await runGit(root, ["rev-parse", "--short", "HEAD"])).trim();
  return { commit, status: await getGitStatus(root) };
}

export interface GitBranch {
  name: string;
  head: string;
  current: boolean;
}

export interface BranchList {
  current: string | null;
  branches: GitBranch[];
}

export async function listBranches(cwd: string): Promise<BranchList> {
  const root = await repositoryRoot(cwd);
  const output = await runGit(root, [
    "for-each-ref",
    "--format=%(refname:short)%00%(objectname:short)%00%(HEAD)",
    "refs/heads",
  ]);
  const branches: GitBranch[] = [];
  for (const line of output.split("\n")) {
    if (!line) continue;
    const [name, head, marker] = line.split("\0");
    if (!name || !head) continue;
    branches.push({ name, head, current: marker === "*" });
  }
  return { current: branches.find((branch) => branch.current)?.name ?? null, branches };
}

async function assertBranchName(cwd: string, branch: string): Promise<void> {
  if (!branch.trim() || branch.startsWith("-")) {
    throw new GitWriteError(`Invalid branch name: ${branch}`, "invalid_branch_name", 400);
  }
  try {
    await runGit(cwd, ["check-ref-format", "--branch", branch]);
  } catch {
    throw new GitWriteError(`Invalid branch name: ${branch}`, "invalid_branch_name", 400);
  }
}

export interface CheckoutOptions {
  branch: string;
  create?: boolean;
}

export async function checkoutBranch(cwd: string, options: CheckoutOptions): Promise<{ branch: string }> {
  const root = await repositoryRoot(cwd);
  await assertBranchName(root, options.branch);
  const args = options.create ? ["checkout", "-b", options.branch] : ["checkout", options.branch];
  await runGit(root, args);
  return { branch: options.branch };
}
