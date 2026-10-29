import { z } from "zod";
import { json, readJson } from "@/server/http";
import { routeContract } from "@/server/contract";
import { apiErrorBody } from "@/lib/api-utils";
import { statSync, type Stats } from "fs";
import { homedir } from "os";
import { isAbsolute, resolve } from "path";
import { allowFileRoot } from "@/lib/file-access";
import { projectIdentityKey } from "@/lib/paths";
import { resolveProject } from "@/lib/worktree";

export const contract = routeContract({
  POST: {
    summary: "Validate a candidate workspace directory and resolve its project root",
    request: { body: z.object({ cwd: z.string() }) },
    responses: {
      200: z.object({
        success: z.literal(true),
        cwd: z.string(),
        projectRoot: z.string(),
        projectKey: z.string(),
      }),
      400: z.looseObject({ error: z.string(), code: z.string() }),
    },
  },
});

function normalizeCwd(cwd: string): string {
  if (cwd === "~") return homedir();
  if (cwd.startsWith("~/")) return resolve(homedir(), cwd.slice(2));
  return isAbsolute(cwd) ? cwd : resolve(cwd);
}

// POST /api/workspace/cwd/validate  body: { cwd: string }
// Validates a candidate workspace before the UI selects it.
export async function POST(req: Request) {
  try {
    const parsed = await readJson<{ cwd?: unknown }>(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;
    const cwd = typeof body.cwd === "string" ? body.cwd.trim() : "";

    if (!cwd) {
      return json({ error: "Path is required", code: "path_required" }, { status: 400 });
    }

    const normalizedCwd = normalizeCwd(cwd);
    let stat: Stats;
    try {
      stat = statSync(normalizedCwd);
    } catch {
      return json({ error: `Directory does not exist: ${cwd}`, code: "directory_not_found" }, { status: 400 });
    }

    if (!stat.isDirectory()) {
      return json({ error: `Path is not a directory: ${cwd}`, code: "not_a_directory" }, { status: 400 });
    }

    allowFileRoot(normalizedCwd);
    const project = await resolveProject(normalizedCwd);
    return json({
      success: true,
      cwd: normalizedCwd,
      projectRoot: project.projectRoot,
      projectKey: projectIdentityKey(project.projectRoot),
    });
  } catch (error) {
    return json(apiErrorBody(error), { status: 500 });
  }
}
