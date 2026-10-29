import { z } from "zod";
import { json } from "@/server/http";
import { apiErrorBody } from "@/lib/api-utils";
import { stat } from "fs/promises";
import { errorEnvelope, routeContract } from "@/server/contract";
import { browsableDirectory } from "@/server/schemas/workspace";
import {
  getBrowseStartDirectory,
  getParentDirectory,
  listDirectories,
  listWindowsDrives,
  resolveDirectory,
  shouldShowWindowsDrivePicker,
} from "@/lib/directory-browser";

export const contract = routeContract({
  GET: {
    summary: "List readable subdirectories for the workspace directory picker (drive list on Windows without a path)",
    request: { query: z.object({ path: z.string().optional() }) },
    responses: {
      200: z.looseObject({
        path: z.string(),
        parentPath: z.string().nullable(),
        directories: z.array(browsableDirectory),
        drives: z.array(browsableDirectory).optional(),
      }),
      400: errorEnvelope,
      404: errorEnvelope,
      500: errorEnvelope,
    },
  },
});

// GET /api/workspace/cwd/browse?path=... — lists readable subdirectories in the filesystem.
export async function GET(request: Request) {
  try {
    const requested = new URL(request.url).searchParams.get("path")?.trim();
    if (shouldShowWindowsDrivePicker(requested)) {
      return json({ path: "", parentPath: null, drives: await listWindowsDrives(), directories: [] });
    }
    const candidate = getBrowseStartDirectory(requested);

    let resolved: string;
    try {
      resolved = await resolveDirectory(candidate);
    } catch {
      return json({ error: "Directory does not exist", code: "directory_not_found" }, { status: 404 });
    }


    const directoryStat = await stat(resolved);
    if (!directoryStat.isDirectory()) {
      return json({ error: "Path is not a directory", code: "not_a_directory" }, { status: 400 });
    }

    const directories = await listDirectories(resolved);

    return json({
      path: resolved,
      parentPath: getParentDirectory(resolved),
      directories,
    });
  } catch (error) {
    return json(apiErrorBody(error), { status: 500 });
  }
}
