import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { getFileLanguage, TEXT_PREVIEW_MAX_BYTES } from "./file-types";
import { createChildProcessEnvironment } from "./project-command-env";
import type {
  GitCollapseReason,
  GitFileContentsResponse,
  GitFileDiffResponse,
  GitFileStatus,
  GitStatusResponse,
} from "./git-types";
import {
  classifyGitStatus,
  GIT_REVIEW_ATTRIBUTES,
  parseGitCollapseReasons,
  parseGitPorcelainV1,
  type GitPorcelainEntry,
} from "./git-status";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 10_000;
const GIT_STATUS_MAX_BUFFER = 8 * 1024 * 1024;

async function git(cwd: string, args: string[], maxBuffer = GIT_STATUS_MAX_BUFFER, input?: string): Promise<string> {
  const pending = execFileAsync("git", ["-C", cwd, ...args], {
    timeout: GIT_TIMEOUT_MS,
    maxBuffer,
    env: createChildProcessEnvironment({ LC_ALL: "C" }),
  });
  if (input !== undefined) {
    // git may exit before reading stdin (EPIPE); that failure surfaces through `pending`.
    pending.child.stdin?.on("error", () => {});
    pending.child.stdin?.end(input);
  }
  return (await pending).stdout;
}

function gitBuffer(cwd: string, args: string[], maxBuffer: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["-C", cwd, ...args],
      {
        timeout: GIT_TIMEOUT_MS,
        maxBuffer,
        env: createChildProcessEnvironment({ LC_ALL: "C" }),
        encoding: "buffer",
      },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout as Buffer);
      },
    );
  });
}

type ContentSide = "HEAD" | "INDEX" | "WORKTREE" | "EMPTY" | { revision: string };

function parseContentSide(value: string | undefined, fallback: "HEAD" | "WORKTREE"): ContentSide {
  const raw = (value ?? fallback).trim();
  if (raw === "HEAD" || raw === "INDEX" || raw === "WORKTREE" || raw === "EMPTY") return raw;
  return { revision: raw };
}

type SideRead =
  | { ok: true; data: Buffer }
  | { ok: false; reason: "missing" | "truncated" };

async function readContentSide(repositoryRoot: string, relativePath: string, side: ContentSide): Promise<SideRead> {
  if (side === "EMPTY") return { ok: true, data: Buffer.alloc(0) };
  if (side === "WORKTREE") {
    try {
      const filePath = path.join(repositoryRoot, relativePath);
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) return { ok: false, reason: "missing" };
      if (stat.size > TEXT_PREVIEW_MAX_BYTES) return { ok: false, reason: "truncated" };
      return { ok: true, data: fs.readFileSync(filePath) };
    } catch {
      return { ok: false, reason: "missing" };
    }
  }
  const spec = side === "INDEX" ? `:${relativePath}` : `${side === "HEAD" ? "HEAD" : side.revision}:${relativePath}`;
  try {
    const size = Number((await git(repositoryRoot, ["cat-file", "-s", spec])).trim());
    if (!Number.isFinite(size)) return { ok: false, reason: "missing" };
    if (size > TEXT_PREVIEW_MAX_BYTES) return { ok: false, reason: "truncated" };
    return { ok: true, data: await gitBuffer(repositoryRoot, ["cat-file", "blob", spec], TEXT_PREVIEW_MAX_BYTES * 2) };
  } catch {
    return { ok: false, reason: "missing" };
  }
}

async function findRepositoryRoot(cwd: string): Promise<string | null> {
  try {
    return (await git(cwd, ["rev-parse", "--show-toplevel"])).trim() || null;
  } catch {
    return null;
  }
}

function isWithinPath(parent: string, target: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(target));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function toGitPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

async function readStatusEntries(repositoryRoot: string): Promise<GitPorcelainEntry[]> {
  const output = await git(repositoryRoot, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]);
  return parseGitPorcelainV1(output);
}

// Honors .gitattributes, $GIT_DIR/info/attributes and core.attributesFile.
// Paths go over stdin so large change sets cannot exceed the argv limit.
// Marking is a presentation hint: on failure every file stays in the main list.
async function readCollapseReasons(repositoryRoot: string, relativePaths: string[]): Promise<Map<string, GitCollapseReason>> {
  if (relativePaths.length === 0) return new Map();
  try {
    const output = await git(
      repositoryRoot,
      ["check-attr", "-z", "--stdin", ...GIT_REVIEW_ATTRIBUTES],
      // One record per queried attribute per path, so scale with the list.
      GIT_STATUS_MAX_BUFFER * GIT_REVIEW_ATTRIBUTES.length,
      `${relativePaths.join("\0")}\0`,
    );
    return parseGitCollapseReasons(output);
  } catch {
    return new Map();
  }
}

export async function getGitStatus(cwd: string): Promise<GitStatusResponse> {
  const repositoryRoot = await findRepositoryRoot(cwd);
  if (!repositoryRoot) {
    return { isGitRepository: false, repositoryRoot: null, files: [] };
  }

  const entries = (await readStatusEntries(repositoryRoot))
    .filter((entry) => isWithinPath(cwd, path.resolve(repositoryRoot, entry.path)));
  const reasons = await readCollapseReasons(repositoryRoot, entries.map((entry) => entry.path));
  const files = entries.map((entry): GitFileStatus => ({
    filePath: path.resolve(repositoryRoot, entry.path),
    ...(entry.originalPath ? { originalPath: path.resolve(repositoryRoot, entry.originalPath) } : {}),
    ...classifyGitStatus(entry),
    indexStatus: entry.indexStatus,
    worktreeStatus: entry.worktreeStatus,
    collapseReason: reasons.get(entry.path),
  }));

  return { isGitRepository: true, repositoryRoot, files };
}

function hasNullByte(content: Buffer): boolean {
  return content.includes(0);
}

function createAddedFilePatch(gitPath: string, content: string): string {
  const hasTrailingNewline = content.endsWith("\n");
  const lines = content.split("\n");
  if (hasTrailingNewline) lines.pop();
  const body = lines.map((line) => `+${line}`).join("\n");
  const noNewlineMarker = !hasTrailingNewline && lines.length > 0
    ? "\n\\ No newline at end of file"
    : "";
  return [
    `diff --git a/${gitPath} b/${gitPath}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${gitPath}`,
    `@@ -0,0 +1,${lines.length} @@`,
    `${body}${noNewlineMarker}`,
  ].join("\n");
}

async function createTrackedFilePatch(
  repositoryRoot: string,
  relativePath: string,
  originalPath?: string,
): Promise<string | null> {
  const paths = originalPath && originalPath !== relativePath
    ? [originalPath, relativePath]
    : [relativePath];
  try {
    return await git(repositoryRoot, [
      "diff",
      "--no-color",
      "--no-ext-diff",
      "--unified=3",
      "HEAD",
      "--",
      ...paths,
    ], TEXT_PREVIEW_MAX_BYTES * 4);
  } catch {
    return null;
  }
}

export async function getGitFileDiff(cwd: string, filePath: string): Promise<GitFileDiffResponse> {
  const repositoryRoot = await findRepositoryRoot(cwd);
  if (!repositoryRoot || !isWithinPath(repositoryRoot, filePath)) return { supported: false };

  const resolvedFilePath = path.resolve(filePath);
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(resolvedFilePath);
  } catch {
    return { supported: false };
  }
  if (!stat.isFile() || stat.size > TEXT_PREVIEW_MAX_BYTES) return { supported: false };

  const relativePath = toGitPath(path.relative(repositoryRoot, resolvedFilePath));
  const entries = await readStatusEntries(repositoryRoot);
  const entry = entries.find((candidate) => candidate.path === relativePath);
  if (!entry) return { supported: false };

  const { status } = classifyGitStatus(entry);
  if (status === "deleted") return { supported: false };

  const currentBuffer = fs.readFileSync(resolvedFilePath);
  if (hasNullByte(currentBuffer)) return { supported: false };
  // `-diff` files: git itself prints no textual diff, so neither do we.
  if ((await readCollapseReasons(repositoryRoot, [relativePath])).get(relativePath) === "no-diff") {
    return { supported: false };
  }
  const newContent = currentBuffer.toString("utf8");

  let patch: string;
  if (status === "untracked") {
    patch = createAddedFilePatch(relativePath, newContent);
  } else {
    const trackedPatch = await createTrackedFilePatch(repositoryRoot, relativePath, entry.originalPath);
    if (trackedPatch === null) {
      if (status !== "added") return { supported: false };
      patch = createAddedFilePatch(relativePath, newContent);
    } else {
      patch = trackedPatch;
    }
  }

  if (!patch.includes("\n@@ ")) return { supported: false };
  return { supported: true, status, patch };
}

/**
 * Before/after text for one file between two git states. `from`/`to` accept
 * HEAD, INDEX, WORKTREE, EMPTY, or a commit hash. Missing sides are empty:
 * an added file has no before, a deleted file has no after.
 */
export async function getGitFileContents(
  cwd: string,
  filePath: string,
  options: { from?: string; to?: string; oldPath?: string } = {},
): Promise<GitFileContentsResponse> {
  const repositoryRoot = await findRepositoryRoot(cwd);
  if (!repositoryRoot) return { supported: false };
  const resolvedPath = path.resolve(filePath);
  if (!isWithinPath(repositoryRoot, resolvedPath)) return { supported: false };
  const resolvedOldPath = options.oldPath ? path.resolve(options.oldPath) : resolvedPath;
  if (!isWithinPath(repositoryRoot, resolvedOldPath)) return { supported: false };
  const relativePath = toGitPath(path.relative(repositoryRoot, resolvedPath));
  const relativeOldPath = toGitPath(path.relative(repositoryRoot, resolvedOldPath));
  const from = parseContentSide(options.from, "HEAD");
  const to = parseContentSide(options.to, "WORKTREE");
  const before = await readContentSide(repositoryRoot, relativeOldPath, from);
  const after = await readContentSide(repositoryRoot, relativePath, to);
  if ((!before.ok && before.reason === "truncated") || (!after.ok && after.reason === "truncated")) {
    return { supported: false, truncated: true };
  }
  const beforeData = before.ok ? before.data : Buffer.alloc(0);
  const afterData = after.ok ? after.data : Buffer.alloc(0);
  if (hasNullByte(beforeData) || hasNullByte(afterData)) return { supported: false, binary: true };
  return {
    supported: true,
    before: beforeData.toString("utf8"),
    after: afterData.toString("utf8"),
    language: getFileLanguage(resolvedPath),
    ...(relativeOldPath !== relativePath ? { oldPath: resolvedOldPath } : {}),
  };
}
