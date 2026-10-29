import { z } from "zod";
import { json, readJson } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import type { SkillInstallScope } from "@/lib/api-types";
import { checkSkillUpdates } from "@/lib/skill-updates";
import { loadSkillsWithInstallInfo } from "@/lib/skills-service";
import { getAllowedFileRoots, isExistingFilePathAllowed } from "@/lib/file-access";
import { skillInstallScopeSchema, skillUpdateSchema } from "@/server/schemas/system-ops";

export const contract = routeContract({
  POST: {
    summary: "Check installed skills for available updates, optionally for one package and scope",
    request: {
      body: z.object({
        cwd: z.string(),
        package: z.string().optional(),
        scope: skillInstallScopeSchema.optional(),
      }),
    },
    responses: {
      200: z.looseObject({ updates: z.array(skillUpdateSchema) }),
      400: errorEnvelope,
      403: errorEnvelope,
      404: errorEnvelope,
      500: errorEnvelope,
    },
  },
});

export async function POST(req: Request) {
  try {
    const parsed = await readJson<{
      cwd?: unknown;
      package?: unknown;
      scope?: unknown;
    }>(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;
    const cwd = typeof body.cwd === "string" ? body.cwd : "";
    if (!cwd) return json({ error: "cwd required", code: "cwd_required" }, { status: 400 });
    const allowedRoots = await getAllowedFileRoots();
    if (!isExistingFilePathAllowed(cwd, allowedRoots)) {
      return json({ error: "Access denied", code: "access_denied" }, { status: 403 });
    }

    const pkg = typeof body.package === "string" ? body.package : undefined;
    const scope = body.scope === "global" || body.scope === "project"
      ? body.scope as SkillInstallScope
      : undefined;
    if ((pkg && !scope) || (!pkg && scope)) {
      return json({ error: "package and scope must be provided together", code: "package_scope_together" }, { status: 400 });
    }

    const { skills } = await loadSkillsWithInstallInfo(cwd);
    const installs = skills
      .map((skill) => skill.install)
      .filter((install): install is NonNullable<typeof install> => Boolean(install))
      .filter((install) => !pkg || (install.package === pkg && install.scope === scope));

    if (pkg && installs.length === 0) {
      return json({ error: "Installed skill not found", code: "skill_not_installed" }, { status: 404 });
    }

    const updates = await checkSkillUpdates(installs, {
      githubToken: process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
    });
    return json({ updates });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error), code: "skill_check_failed" },
      { status: 500 },
    );
  }
}
