import fs from "fs";
import { z } from "zod";
import { json } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { getAllowedFileRoots, isExistingFilePathAllowed, isFilePathAllowed, isWindowsAbsolutePath } from "@/lib/file-access";
import { resolveGithubRepo } from "@/lib/github-repo";

export const contract = routeContract({
  GET: {
    summary: "Resolve the GitHub repository (owner/name) configured as a remote for one workspace directory",
    request: { query: z.object({ cwd: z.string() }) },
    responses: {
      200: z.looseObject({ repo: z.string().nullable() }),
      400: errorEnvelope,
      403: errorEnvelope,
      404: errorEnvelope,
    },
  },
});

export async function GET(request: Request) {
  const cwd = new URL(request.url).searchParams.get("cwd")?.trim() ?? "";
  if (!cwd || (!cwd.startsWith("/") && !isWindowsAbsolutePath(cwd))) {
    return json({ error: "cwd must be an absolute path", code: "cwd_must_be_absolute" }, { status: 400 });
  }
  const allowedRoots = await getAllowedFileRoots();
  if (!isFilePathAllowed(cwd, allowedRoots)) {
    return json({ error: "Access denied", code: "access_denied" }, { status: 403 });
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(cwd);
  } catch {
    return json({ error: "Directory not found", code: "directory_not_found" }, { status: 404 });
  }
  if (!stat.isDirectory()) {
    return json({ error: "Not a directory", code: "not_a_directory" }, { status: 400 });
  }
  if (!isExistingFilePathAllowed(cwd, allowedRoots)) {
    return json({ error: "Access denied", code: "access_denied" }, { status: 403 });
  }
  return json({ repo: await resolveGithubRepo(cwd) });
}
