import { z } from "zod";
import { errorEnvelope, routeContract } from "@/server/contract";
import { json, readJson } from "@/server/http";
import { gitErrorResponse, requireWorkspace } from "@/server/workspace-access";
import { gitStatusSchema } from "@/server/schemas/git";
import { stageChanges } from "@/lib/git-write";

const bodySchema = z.object({
  cwd: z.string(),
  paths: z.array(z.string()).optional(),
  all: z.boolean().optional(),
});

export const contract = routeContract({
  POST: {
    summary: "Stage repository changes (explicit paths or all)",
    request: { body: bodySchema },
    responses: { 200: gitStatusSchema, 400: errorEnvelope, 403: errorEnvelope },
  },
});

export async function POST(req: Request) {
  const parsed = await readJson<z.infer<typeof bodySchema>>(req);
  if (!parsed.ok) return parsed.response;
  const gate = await requireWorkspace(parsed.body.cwd);
  if (!gate.ok) return gate.response;
  if (!parsed.body.all && (!parsed.body.paths || parsed.body.paths.length === 0)) {
    return json({ error: "paths or all is required", code: "paths_required" }, { status: 400 });
  }
  try {
    return json(await stageChanges(gate.cwd, parsed.body));
  } catch (error) {
    return gitErrorResponse(error);
  }
}
