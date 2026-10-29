import { statSync } from "node:fs";
import { json } from "./http";
import { GitWriteError } from "@/lib/git-write";
import { FileMutationError } from "@/lib/file-mutations";
import {
  getAllowedFileRoots,
  isExistingFilePathAllowed,
  isFilePathAllowed,
  isWindowsAbsolutePath,
} from "@/lib/file-access";

/**
 * Authorization gate shared by the workspace mutation routes: only session
 * cwds, project roots and explicitly allowed directories may be touched.
 */
export async function requireWorkspace(
  cwd: unknown,
): Promise<{ ok: true; cwd: string } | { ok: false; response: Response }> {
  if (typeof cwd !== "string" || !cwd.trim()) {
    return { ok: false, response: json({ error: "cwd is required", code: "cwd_required" }, { status: 400 }) };
  }
  const value = cwd.trim();
  if (!value.startsWith("/") && !isWindowsAbsolutePath(value)) {
    return {
      ok: false,
      response: json({ error: "cwd must be an absolute path", code: "cwd_must_be_absolute" }, { status: 400 }),
    };
  }
  const roots = await getAllowedFileRoots();
  if (!isFilePathAllowed(value, roots)) {
    return { ok: false, response: json({ error: "Access denied", code: "access_denied" }, { status: 403 }) };
  }
  let stat;
  try {
    stat = statSync(value);
  } catch {
    return {
      ok: false,
      response: json({ error: "Directory not found", code: "directory_not_found" }, { status: 404 }),
    };
  }
  if (!stat.isDirectory()) {
    return { ok: false, response: json({ error: "Not a directory", code: "not_a_directory" }, { status: 400 }) };
  }
  if (!isExistingFilePathAllowed(value, roots)) {
    return { ok: false, response: json({ error: "Access denied", code: "access_denied" }, { status: 403 }) };
  }
  return { ok: true, cwd: value };
}

export function gitErrorResponse(error: unknown): Response {
  if (error instanceof GitWriteError) {
    return json({ error: error.message, code: error.code }, { status: error.status });
  }
  return json(
    { error: error instanceof Error ? error.message : String(error), code: "git_command_failed" },
    { status: 500 },
  );
}

export function fileMutationErrorResponse(error: unknown): Response {
  if (error instanceof FileMutationError) {
    return json({ error: error.message, code: error.code }, { status: error.status });
  }
  return json(
    { error: error instanceof Error ? error.message : String(error), code: "file_mutation_failed" },
    { status: 500 },
  );
}
