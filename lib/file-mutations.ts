import { existsSync, lstatSync, mkdirSync, realpathSync, renameSync, rmSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { isPathWithinRoots } from "./file-access";

/**
 * File mutations inside an authorized workspace root: write, rename, delete.
 *
 * Every path is resolved against the root and checked again through its
 * nearest existing ancestor's realpath, so a symlinked directory cannot
 * redirect a write outside the workspace.
 */

export const MAX_WORKSPACE_WRITE_BYTES = 8 * 1024 * 1024;

export function containingRoot(target: string, roots: Iterable<string>): string | null {
  let best: string | null = null;
  for (const root of roots) {
    if (!isPathWithinRoots(target, new Set([root]))) continue;
    if (!best || root.length > best.length) best = root;
  }
  return best;
}

export class FileMutationError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "FileMutationError";
    this.code = code;
    this.status = status;
  }
}

function realRoot(root: string): string {
  try {
    return realpathSync(root);
  } catch {
    throw new FileMutationError("Workspace root not found", "workspace_not_found", 404);
  }
}

function resolveInsideRoot(root: string, relativePath: string): string {
  if (typeof relativePath !== "string" || !relativePath.trim() || relativePath.includes("\0")) {
    throw new FileMutationError("A relative file path is required", "invalid_path", 400);
  }
  if (isAbsolute(relativePath)) {
    throw new FileMutationError("Path must be relative to the workspace", "invalid_path", 400);
  }
  const target = resolve(root, relativePath);
  if (!isPathWithinRoots(target, new Set([root]))) {
    throw new FileMutationError("Path is outside the workspace", "path_outside_workspace", 403);
  }
  return target;
}

/** Rejects symlinked targets and ancestors that resolve outside the root. */
function assertInsideRealRoot(root: string, target: string): void {
  const canonicalRoot = realRoot(root);
  let probe = target;
  while (!existsSync(probe)) {
    const parent = dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  let canonicalProbe: string;
  try {
    canonicalProbe = realpathSync(probe);
  } catch {
    throw new FileMutationError("Path is not accessible", "path_not_accessible", 403);
  }
  if (!isPathWithinRoots(canonicalProbe, new Set([canonicalRoot]))) {
    throw new FileMutationError("Path is outside the workspace", "path_outside_workspace", 403);
  }
  if (existsSync(target) && lstatSync(target).isSymbolicLink()) {
    throw new FileMutationError("Refusing to mutate a symlink", "symlink_not_allowed", 403);
  }
}

async function atomicWrite(target: string, content: string): Promise<void> {
  const temporary = `${target}.omp-web-${randomUUID()}.tmp`;
  try {
    await Bun.write(temporary, content);
    renameSync(temporary, target);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // The temporary file may not have been created.
    }
    throw new FileMutationError(
      error instanceof Error ? error.message : String(error),
      "write_failed",
      500,
    );
  }
}

export interface WriteFileOptions {
  createParents?: boolean;
}

export interface WrittenFile {
  path: string;
  bytes: number;
}

export async function writeWorkspaceFile(
  root: string,
  relativePath: string,
  content: string,
  options: WriteFileOptions = {},
): Promise<WrittenFile> {
  if (typeof content !== "string") {
    throw new FileMutationError("content must be a string", "invalid_content", 400);
  }
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > MAX_WORKSPACE_WRITE_BYTES) {
    throw new FileMutationError(
      `File exceeds the ${MAX_WORKSPACE_WRITE_BYTES} byte write limit`,
      "file_too_large",
      413,
    );
  }
  const target = resolveInsideRoot(root, relativePath);
  assertInsideRealRoot(root, target);
  if (existsSync(target) && lstatSync(target).isDirectory()) {
    throw new FileMutationError("Target is a directory", "not_a_file", 400);
  }
  if (options.createParents !== false) mkdirSync(dirname(target), { recursive: true });
  await atomicWrite(target, content);
  return { path: target, bytes };
}

export interface RenameOptions {
  overwrite?: boolean;
}

export interface RenamedPath {
  from: string;
  to: string;
}

export function renameWorkspacePath(
  root: string,
  from: string,
  to: string,
  options: RenameOptions = {},
): RenamedPath {
  const source = resolveInsideRoot(root, from);
  const target = resolveInsideRoot(root, to);
  if (source === target) return { from: source, to: target };
  assertInsideRealRoot(root, source);
  assertInsideRealRoot(root, target);
  if (!existsSync(source)) {
    throw new FileMutationError("Source path not found", "not_found", 404);
  }
  if (existsSync(target) && !options.overwrite) {
    throw new FileMutationError("Target path already exists", "target_exists", 409);
  }
  mkdirSync(dirname(target), { recursive: true });
  try {
    renameSync(source, target);
  } catch (error) {
    throw new FileMutationError(
      error instanceof Error ? error.message : String(error),
      "rename_failed",
      500,
    );
  }
  return { from: source, to: target };
}

export interface DeleteOptions {
  recursive?: boolean;
}

export function deleteWorkspacePath(
  root: string,
  relativePath: string,
  options: DeleteOptions = {},
): { path: string } {
  const target = resolveInsideRoot(root, relativePath);
  if (target === resolve(root)) {
    throw new FileMutationError("Refusing to delete the workspace root", "invalid_path", 400);
  }
  assertInsideRealRoot(root, target);
  if (!existsSync(target)) {
    throw new FileMutationError("Path not found", "not_found", 404);
  }
  const stat = lstatSync(target);
  try {
    if (stat.isDirectory()) {
      if (!options.recursive) {
        throw new FileMutationError("Directory delete requires recursive=true", "directory_not_empty", 409);
      }
      rmSync(target, { recursive: true, force: false });
    } else {
      unlinkSync(target);
    }
  } catch (error) {
    if (error instanceof FileMutationError) throw error;
    throw new FileMutationError(
      error instanceof Error ? error.message : String(error),
      "delete_failed",
      500,
    );
  }
  return { path: target };
}
