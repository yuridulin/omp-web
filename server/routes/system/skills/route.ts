import { z } from "zod";
import { json, readJson } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "fs";
import { basename } from "path";
import {
  getSkillToggleRoots,
  loadSkillsWithInstallInfo,
  parseSkillFrontmatter,
  readDisableModelInvocation,
  setDisableModelInvocation,
} from "@/lib/skills-service";
import { getAllowedFileRoots, isExistingFilePathAllowed } from "@/lib/file-access";
import { skillsResponseSchema } from "@/server/schemas/system-ops";

export const contract = routeContract({
  GET: {
    summary: "List the skills omp resolves for a workspace, with install and togglability info",
    request: { query: z.object({ cwd: z.string() }) },
    responses: {
      200: skillsResponseSchema,
      400: errorEnvelope,
      403: errorEnvelope,
      500: errorEnvelope,
    },
  },
  PATCH: {
    summary: "Toggle disable-model-invocation on a SKILL.md file",
    request: {
      body: z.object({
        filePath: z.string(),
        disableModelInvocation: z.boolean(),
        cwd: z.string().optional(),
      }),
    },
    responses: {
      200: z.looseObject({ success: z.literal(true), disableModelInvocation: z.boolean() }),
      400: errorEnvelope,
      403: errorEnvelope,
      404: errorEnvelope,
      500: errorEnvelope,
    },
  },
});

// GET /api/system/skills?cwd=<path>
// Lists what omp resolves (`omp skill list --json`), falling back to a scan
// of omp's skill roots on binaries that predate the command. Each skill
// carries `togglable`, the same check PATCH applies.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cwd = searchParams.get("cwd");
  if (!cwd) return json({ error: "cwd required", code: "cwd_required" }, { status: 400 });

  try {
    const allowedRoots = await getAllowedFileRoots();
    if (!isExistingFilePathAllowed(cwd, allowedRoots)) {
      return json({ error: "Access denied", code: "access_denied" }, { status: 403 });
    }
    return json(await loadSkillsWithInstallInfo(cwd));
  } catch (e) {
    return json({ error: String(e), code: "internal_error" }, { status: 500 });
  }
}

// PATCH /api/system/skills — toggle disable-model-invocation on a SKILL.md file
export async function PATCH(req: Request) {
  try {
    const parsed = await readJson<{ filePath: string; disableModelInvocation: boolean; cwd?: string }>(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;
    const { filePath, disableModelInvocation, cwd } = body;
    if (!filePath) return json({ error: "filePath required", code: "file_path_required" }, { status: 400 });
    if (basename(filePath) !== "SKILL.md") {
      return json({ error: "not a SKILL.md file", code: "not_a_skill_file" }, { status: 400 });
    }
    if (!existsSync(filePath)) return json({ error: "file not found", code: "file_not_found" }, { status: 404 });
    // Every user-owned root the scanner reads must be writable here, or skills
    // in the compat dirs (~/.agents/skills — where the app's own global
    // installs land, ~/.claude/skills, ~/.codex/skills, managed-skills) could
    // be listed but never toggled. Session cwds cover the project-scope roots;
    // an optional cwd (already an allowed root) adds the project walk-up roots.
    // Plugin/registry skills stay read-only (see getSkillToggleRoots).
    const allowedRoots = await getSkillToggleRoots(cwd);
    // Resolve symlinks once up front and authorize the resolved path: the
    // read/write below then operate on the same resolved path, so a symlink
    // swapped between the authorization check and the write cannot redirect
    // it outside the checked roots.
    const resolvedFilePath = realpathSync(filePath);
    if (!isExistingFilePathAllowed(resolvedFilePath, allowedRoots)) {
      return json({ error: "Access denied", code: "access_denied" }, { status: 403 });
    }

    const content = readFileSync(resolvedFilePath, "utf8");
    const updated = setDisableModelInvocation(content, disableModelInvocation);
    if (updated !== content) writeFileSync(resolvedFilePath, updated, "utf8");

    // Report what the file now says rather than what was asked for.
    const { frontmatter } = parseSkillFrontmatter(updated);
    return json({ success: true, disableModelInvocation: readDisableModelInvocation(frontmatter) });
  } catch (e) {
    return json({ error: String(e), code: "internal_error" }, { status: 500 });
  }
}
