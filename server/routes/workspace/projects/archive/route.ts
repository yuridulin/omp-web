import { z } from "zod";
import { json, readJson } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { apiErrorBody } from "@/lib/api-utils";
import { comparableProjectPath } from "@/lib/comparable-path";
import {
  archiveSessions,
  loadSessionArchiveRegistry,
  saveSessionArchiveRegistry,
} from "@/lib/session-archive-registry";
import { hideProject, loadProjectRegistry, saveProjectRegistry } from "@/lib/project-registry";
import { invalidateSessionListCache, listAllSessions } from "@/lib/session-reader";
import { resolveProject } from "@/lib/worktree";

export const contract = routeContract({
  POST: {
    summary: "Mark every session of a project archived and hide the project from the sidebar",
    request: {
      body: z.looseObject({ cwd: z.string() }),
    },
    responses: {
      200: z.looseObject({
        projectRoot: z.string(),
        archived: z.array(z.string()),
      }),
      400: errorEnvelope,
      500: errorEnvelope,
    },
  },
});

/**
 * POST /api/workspace/projects/archive  body: { cwd }
 *
 * Marks every session that groups under the project archived and hides the
 * project in the registry. Nothing in omp's session tree moves or stops: the
 * sessions stay readable and resumable, they just leave the rail.
 */
export async function POST(req: Request) {
  try {
    const bodyResult = await readJson<{ cwd?: unknown }>(req);
    if (!bodyResult.ok) return bodyResult.response;
    const body = bodyResult.body;
    const cwd = typeof body.cwd === "string" ? body.cwd.trim() : "";
    if (!cwd) return json({ error: "Path is required", code: "path_required" }, { status: 400 });

    const { projectRoot } = await resolveProject(cwd);
    const key = comparableProjectPath(projectRoot);
    const archived = (await listAllSessions())
      .filter((session) => comparableProjectPath(session.projectRoot ?? session.cwd) === key)
      .map((session) => session.id);

    const registry = loadSessionArchiveRegistry();
    const next = archiveSessions(registry, archived);
    if (next !== registry) {
      saveSessionArchiveRegistry(next);
      invalidateSessionListCache();
    }
    saveProjectRegistry(hideProject(loadProjectRegistry(), projectRoot));
    return json({ projectRoot, archived });
  } catch (error) {
    return json(apiErrorBody(error), { status: 500 });
  }
}
