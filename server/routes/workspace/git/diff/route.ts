import { z } from "zod";
import { json } from "@/server/http";
import { apiErrorBody } from "@/lib/api-utils";
import { errorEnvelope, routeContract } from "@/server/contract";
import { getAllowedFileRoots, isExistingFilePathAllowed, isFilePathAllowed, isWindowsAbsolutePath } from "@/lib/file-access";
import { gitFileStatusSchema } from "@/server/schemas/git";
import { getGitFileDiff } from "@/lib/git-changes";

export const contract = routeContract({
  GET: {
    summary: "Return the working-tree diff for one changed file as JSON (supported: false when no textual diff exists)",
    request: {
      query: z.object({
        cwd: z.string(),
        path: z.string(),
      }),
    },
    responses: {
      200: z.looseObject({
        supported: z.boolean(),
        status: gitFileStatusSchema.shape.status.optional(),
        patch: z.string().optional(),
      }),
      400: errorEnvelope,
      403: errorEnvelope,
      500: errorEnvelope,
    },
  },
});

export async function GET(request: Request) {
  try {
    const cwd = new URL(request.url).searchParams.get("cwd")?.trim() ?? "";
    const filePath = new URL(request.url).searchParams.get("path")?.trim() ?? "";
    if (!cwd || (!cwd.startsWith("/") && !isWindowsAbsolutePath(cwd))) {
      return json({ error: "cwd must be an absolute path", code: "cwd_must_be_absolute" }, { status: 400 });
    }
    if (!filePath || (!filePath.startsWith("/") && !isWindowsAbsolutePath(filePath))) {
      return json({ error: "path must be an absolute path", code: "path_must_be_absolute" }, { status: 400 });
    }

    const allowedRoots = await getAllowedFileRoots();
    if (!isFilePathAllowed(cwd, allowedRoots) || !isFilePathAllowed(filePath, allowedRoots)) {
      return json({ error: "Access denied", code: "access_denied" }, { status: 403 });
    }
    if (!isExistingFilePathAllowed(cwd, allowedRoots) || !isExistingFilePathAllowed(filePath, allowedRoots)) {
      return json({ error: "Access denied", code: "access_denied" }, { status: 403 });
    }

    return json(await getGitFileDiff(cwd, filePath));
  } catch (error) {
    return json(apiErrorBody(error), { status: 500 });
  }
}
