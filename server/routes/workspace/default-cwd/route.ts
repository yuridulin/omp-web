import { z } from "zod";
import { json } from "@/server/http";
import { apiErrorBody } from "@/lib/api-utils";
import { mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { allowFileRoot } from "@/lib/file-access";
import { errorEnvelope, routeContract } from "@/server/contract";

export const contract = routeContract({
  POST: {
    summary: "Create today's default workspace directory (~/omp-cwd-YYYYMMDD) if missing and return it",
    responses: {
      200: z.looseObject({ cwd: z.string() }),
      500: errorEnvelope,
    },
  },
});

// POST /api/workspace/default-cwd
// Creates ~/omp-cwd-<YYYYMMDD> if it doesn't exist and returns the path.
export async function POST() {
  try {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const dir = join(homedir(), `omp-cwd-${date}`);
    mkdirSync(dir, { recursive: true });
    allowFileRoot(dir);
    return json({ cwd: dir });
  } catch (error) {
    return json(apiErrorBody(error), { status: 500 });
  }
}
