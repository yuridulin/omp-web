import { z } from "zod";
import { json, readJson } from "@/server/http";
import { apiErrorBody } from "@/lib/api-utils";
import { errorEnvelope, routeContract } from "@/server/contract";
import { worktreeInfo } from "@/server/schemas/workspace";
import { existsSync } from "fs";
import { join } from "path";
import { addWorktree, findCurrentWorktreePath, listWorktrees, removeWorktree, resolveProject } from "@/lib/worktree";
import { allowFileRoot, getAllowedFileRoots, isExistingFilePathAllowed, isFilePathAllowed } from "@/lib/file-access";
import { projectIdentityKey } from "@/lib/paths";
import { invalidateSessionListCache } from "@/lib/session-reader";

export const contract = routeContract({
  GET: {
    summary: "List git worktrees of the project containing cwd, with the current one flagged",
    request: { query: z.object({ cwd: z.string() }) },
    responses: {
      200: z.looseObject({
        projectRoot: z.string(),
        projectKey: z.string(),
        isGit: z.boolean(),
        isTopLevel: z.boolean(),
        currentWorktreePath: z.string().nullable(),
        worktrees: z.array(worktreeInfo),
      }),
      400: errorEnvelope,
      403: errorEnvelope,
      500: errorEnvelope,
    },
  },
  POST: {
    summary: "Create a git worktree for a new or existing branch of the project containing cwd",
    request: { body: z.object({ cwd: z.string(), branch: z.string() }) },
    responses: {
      200: z.looseObject({ path: z.string(), branch: z.string() }),
      400: errorEnvelope,
      403: errorEnvelope,
    },
  },
  DELETE: {
    summary: "Remove a git worktree of the project containing cwd (force removes a dirty one; 409 when dirty without force)",
    request: { body: z.object({ cwd: z.string(), path: z.string(), force: z.boolean().optional() }) },
    responses: {
      200: z.looseObject({ success: z.literal(true) }),
      400: errorEnvelope,
      403: errorEnvelope,
      409: errorEnvelope,
    },
  },
});


/** Same gate as /api/workspace/files: only session cwds / project roots / explicitly
 *  allowed dirs may be inspected or mutated through this endpoint. */
async function checkCwdAllowed(cwd: string): Promise<Response | null> {
  const allowedRoots = await getAllowedFileRoots();
  if (!isFilePathAllowed(cwd, allowedRoots) || !isExistingFilePathAllowed(cwd, allowedRoots)) {
    return json({ error: "Access denied", code: "access_denied" }, { status: 403 });
  }
  return null;
}

/** Map the known English messages thrown by lib/worktree.ts onto stable codes
 * so the client can localize them; unrecognized git errors fall back to
 * `invalid_request` at the call sites. */
function worktreeErrorCode(message: string): string | undefined {
  if (message.startsWith("Branch name is required")) return "branch_required";
  if (message.startsWith("Invalid branch name")) return "invalid_branch_name";
  if (message.startsWith("Directory already exists")) return "worktree_directory_exists";
  if (message.startsWith("Not a worktree of this repository")) return "not_a_worktree";
  if (message.startsWith("Cannot remove the main worktree")) return "cannot_remove_main_worktree";
  return undefined;
}

// GET /api/workspace/worktrees?cwd=  →  { projectRoot, isGit, isTopLevel, worktrees }
export async function GET(req: Request) {
  try {
    const cwd = new URL(req.url).searchParams.get("cwd");
    if (!cwd) {
      return json({ error: "cwd is required", code: "cwd_required" }, { status: 400 });
    }
    const denied = await checkCwdAllowed(cwd);
    if (denied) return denied;

    const project = await resolveProject(cwd);
    let worktrees: Awaited<ReturnType<typeof listWorktrees>> = [];
    let currentWorktreePath: string | null = null;
    let isGit = true;
    try {
      // For a removed-worktree cwd (session of a deleted worktree), fall back
      // to the inferred project root so the switcher still shows the project.
      const hasGit = existsSync(join(cwd, ".git"));
      const queryRoot = hasGit ? cwd : project.projectRoot;
      worktrees = await listWorktrees(queryRoot);
      currentWorktreePath = findCurrentWorktreePath(worktrees, cwd);
    } catch {
      isGit = false;
    }
    // Every listed path is a git-verified worktree of this project; allow the
    // file explorer to browse them even before they have any session (the
    // in-memory allowlist from addWorktree does not survive server restarts).
    for (const w of worktrees) allowFileRoot(w.path);
    return json({
      projectRoot: project.projectRoot,
      projectKey: projectIdentityKey(project.projectRoot),
      isGit,
      isTopLevel: project.isTopLevel,
      currentWorktreePath,
      worktrees,
    });
  } catch (error) {
    return json(apiErrorBody(error), { status: 500 });
  }
}

// POST /api/workspace/worktrees  body: { cwd, branch }  →  { path, branch }
export async function POST(req: Request) {
  try {
    const parsed = await readJson<{ cwd?: string; branch?: string }>(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;
    if (!body.cwd || typeof body.cwd !== "string") {
      return json({ error: "cwd is required", code: "cwd_required" }, { status: 400 });
    }
    if (!body.branch || typeof body.branch !== "string") {
      return json({ error: "branch is required", code: "branch_required" }, { status: 400 });
    }
    const denied = await checkCwdAllowed(body.cwd);
    if (denied) return denied;
    if (!existsSync(body.cwd)) {
      return json({ error: `Directory does not exist: ${body.cwd}`, code: "directory_not_found" }, { status: 400 });
    }

    const result = await addWorktree(body.cwd, body.branch);
    invalidateSessionListCache();
    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message, code: worktreeErrorCode(message) ?? "invalid_request" }, { status: 400 });
  }
}

// DELETE /api/workspace/worktrees  body: { cwd, path, force? }
export async function DELETE(req: Request) {
  try {
    const parsed = await readJson<{ cwd?: string; path?: string; force?: boolean }>(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;
    if (!body.cwd || typeof body.cwd !== "string") {
      return json({ error: "cwd is required", code: "cwd_required" }, { status: 400 });
    }
    if (!body.path || typeof body.path !== "string") {
      return json({ error: "path is required", code: "path_required" }, { status: 400 });
    }
    const denied = await checkCwdAllowed(body.cwd);
    if (denied) return denied;

    await removeWorktree(body.cwd, body.path, body.force === true);
    invalidateSessionListCache();
    return json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // git refuses to remove dirty worktrees without --force; surface that so
    // the UI can offer a force-remove confirmation.
    const dirty = /contains modified or untracked files|is dirty/i.test(message);
    return json(
      { error: message, code: dirty ? "worktree_dirty" : worktreeErrorCode(message) ?? "invalid_request", dirty },
      { status: dirty ? 409 : 400 },
    );
  }
}
