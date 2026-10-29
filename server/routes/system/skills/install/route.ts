import { z } from "zod";
import { json, readJson } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { runBunx } from "@/lib/bunx";
import { createChildProcessEnvironment } from "@/lib/project-command-env";
import { getAllowedFileRoots, isExistingFilePathAllowed } from "@/lib/file-access";

export const contract = routeContract({
  POST: {
    summary: "Install a skills.sh package globally or into a project's .agents/skills directory",
    request: {
      body: z.object({
        package: z.string(),
        scope: z.string().optional(),
        cwd: z.string().optional(),
      }),
    },
    responses: {
      200: z.looseObject({ success: z.literal(true), output: z.string() }),
      400: errorEnvelope,
      403: errorEnvelope,
      500: errorEnvelope,
    },
  },
});

const ANSI_RE = /\x1B\[[0-9;]*m/g;

// POST /api/system/skills/install  body: { package: string; scope: "global" | "project"; cwd?: string }
export async function POST(req: Request) {
  try {
    const parsed = await readJson<{ package?: string; scope?: string; cwd?: string }>(req);
    if (!parsed.ok) return parsed.response;
    const { package: pkg, scope, cwd } = parsed.body;
    if (!pkg?.trim()) return json({ error: "package required", code: "package_required" }, { status: 400 });
    // npm package-name grammar: scope-optional, URL-safe segments. Rejecting
    // leading dashes/`-` prefixes stops a value like `--force` from being
    // interpreted as `bun x`/CLI options instead of a package name.
    const name = pkg.trim();
    if (name.startsWith("-") || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(name)) {
      return json({ error: "Invalid package name", code: "package_invalid" }, { status: 400 });
    }
    const isGlobal = scope !== "project";
    if (!isGlobal) {
      if (!cwd) return json({ error: "cwd required for project install", code: "cwd_required_for_project_install" }, { status: 400 });
      const allowedRoots = await getAllowedFileRoots();
      if (!isExistingFilePathAllowed(cwd, allowedRoots)) {
        return json({ error: "Access denied", code: "access_denied" }, { status: 403 });
      }
    }
    // The skills.sh CLI has no omp agent entry; "universal" installs into the
    // ecosystem-standard ~/.agents/skills (global) / <cwd>/.agents/skills
    // (project), both of which omp discovers via its agent-dirs provider.
    const args = ["skills", "add", name, "-y", "--agent", "universal"];
    if (isGlobal) args.push("-g");

    const { stdout, stderr } = await runBunx(args, {
      timeout: 60000,
      cwd: !isGlobal && cwd ? cwd : undefined,
      env: createChildProcessEnvironment({ FORCE_COLOR: "0" }),
    });

    const output = (stdout + stderr).replace(ANSI_RE, "");
    const success = /Installation complete|Installed \d+ skill/.test(output);
    if (!success) {
      const detail = output.slice(-300);
      return json(
        { error: detail || "Install failed", code: "skill_install_failed" },
        { status: 500 },
      );
    }
    return json({ success: true, output });
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const output = ((err.stdout ?? "") + (err.stderr ?? "")).replace(ANSI_RE, "");
    return json({ error: output || (err.message ?? String(e)), code: "skill_install_failed" }, { status: 500 });
  }
}
