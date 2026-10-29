import { z } from "zod";
import { errorEnvelope, routeContract } from "@/server/contract";
import { json, readJson } from "@/server/http";
import { gitErrorResponse, requireWorkspace } from "@/server/workspace-access";
import { gitStatusSchema } from "@/server/schemas/git";
import { commitChanges } from "@/lib/git-write";

const bodySchema = z.object({
  cwd: z.string(),
  message: z.string(),
  amend: z.boolean().optional(),
  paths: z.array(z.string()).optional(),
});

export const contract = routeContract({
  POST: {
    summary: "Commit staged changes (optionally amend or limit to paths)",
    request: { body: bodySchema },
    responses: {
      200: z.looseObject({ commit: z.string(), status: gitStatusSchema }),
      400: errorEnvelope,
      403: errorEnvelope,
      409: errorEnvelope,
    },
  },
});

export async function POST(req: Request) {
  const parsed = await readJson<z.infer<typeof bodySchema>>(req);
  if (!parsed.ok) return parsed.response;
  const gate = await requireWorkspace(parsed.body.cwd);
  if (!gate.ok) return gate.response;
  try {
    return json(await commitChanges(gate.cwd, parsed.body));
  } catch (error) {
    return gitErrorResponse(error);
  }
}
