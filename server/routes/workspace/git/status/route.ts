import fs from "fs";
import { z } from "zod";
import { json } from "@/server/http";
import { apiErrorBody } from "@/lib/api-utils";
import { errorEnvelope, routeContract } from "@/server/contract";
import { gitStatusSchema } from "@/server/schemas/git";
import { getAllowedFileRoots, isExistingFilePathAllowed, isFilePathAllowed, isWindowsAbsolutePath } from "@/lib/file-access";
import { getGitStatus } from "@/lib/git-changes";

export const contract = routeContract({
  GET: {
    summary: "Return git working-tree status for one workspace directory",
    request: { query: z.object({ cwd: z.string() }) },
    responses: {
      200: gitStatusSchema,
      400: errorEnvelope,
      403: errorEnvelope,
      404: errorEnvelope,
      500: errorEnvelope,
    },
  },
});

export async function GET(request: Request) {
  try {
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

    return json(await getGitStatus(cwd));
  } catch (error) {
    return json(apiErrorBody(error), { status: 500 });
  }
}
