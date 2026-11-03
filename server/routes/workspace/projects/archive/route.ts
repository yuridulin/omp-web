import { z } from "zod";
import { json, readJson } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { apiErrorBody } from "@/lib/api-utils";
import { comparableProjectPath } from "@/lib/comparable-path";
import { archiveSessionFileWithArtifacts } from "@/lib/omp/session-files";
import { hideProject, loadProjectRegistry, saveProjectRegistry } from "@/lib/project-registry";
import { clearExitedRpcSession, getRpcSession } from "@/lib/rpc-manager";
import {
  invalidateSessionListCache,
  invalidateSessionPathCache,
  listAllSessions,
} from "@/lib/session-reader";
import { resolveProject } from "@/lib/worktree";

export const contract = routeContract({
  POST: {
    summary: "Archive every session of a project and hide the project from the sidebar",
    request: {
      body: z.looseObject({ cwd: z.string() }),
    },
    responses: {
      200: z.looseObject({
        projectRoot: z.string(),
        archived: z.array(z.string()),
        failed: z.array(z.looseObject({ id: z.string(), error: z.string() })),
        hidden: z.boolean(),
      }),
      400: errorEnvelope,
      500: errorEnvelope,
    },
  },
});

interface Failure {
  id: string;
  error: string;
}

/**
 * POST /api/workspace/projects/archive  body: { cwd }
 *
 * Archives every session that groups under the project (native OMP gc layout,
 * same as the single-session endpoint) and hides the project in the registry.
 * Children are archived before their parents: the parent's JSONL stores branch
 * paths, so moving it first would leave live children pointing at a dead file.
 * When a session cannot be archived the project stays visible and the response
 * reports the failures instead of hiding rows the sidebar would still show.
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
    const sessions = await listAllSessions();
    const targets = sessions.filter(
      (session) => comparableProjectPath(session.projectRoot ?? session.cwd) === key,
    );

    const childrenOf = new Map<string, string[]>();
    for (const session of sessions) {
      if (!session.parentSessionId) continue;
      const list = childrenOf.get(session.parentSessionId);
      if (list) list.push(session.id);
      else childrenOf.set(session.parentSessionId, [session.id]);
    }

    const live = new Set(sessions.map((session) => session.id));
    const pending = new Map(targets.map((session) => [session.id, session]));
    const archived: string[] = [];
    const failed: Failure[] = [];

    // Repeatedly take leaves: everything with no live child is safe to move.
    while (pending.size > 0) {
      const leaves = [...pending.values()].filter((session) => {
        const children = childrenOf.get(session.id) ?? [];
        return !children.some((childId) => live.has(childId));
      });
      if (leaves.length === 0) {
        // A cycle or a child outside this project. Report what is stuck and
        // leave those sessions live rather than moving a parent first.
        for (const session of pending.values()) {
          failed.push({ id: session.id, error: "Archive child sessions before archiving this session" });
        }
        break;
      }
      for (const session of leaves) {
        try {
          // OMP owns writes while a child is live; wait for the final flush.
          await getRpcSession(session.id)?.destroyAndWait?.();
          archiveSessionFileWithArtifacts(session.path);
          clearExitedRpcSession(session.id);
          invalidateSessionPathCache(session.id);
          archived.push(session.id);
          live.delete(session.id);
        } catch (error) {
          failed.push({ id: session.id, error: error instanceof Error ? error.message : String(error) });
        }
        pending.delete(session.id);
      }
    }

    if (archived.length > 0) invalidateSessionListCache();

    const hidden = failed.length === 0;
    if (hidden) {
      saveProjectRegistry(hideProject(loadProjectRegistry(), projectRoot));
    }
    return json({ projectRoot, archived, failed, hidden });
  } catch (error) {
    return json(apiErrorBody(error), { status: 500 });
  }
}
