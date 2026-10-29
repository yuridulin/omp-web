import { z } from "zod";
import { errorEnvelope, routeContract } from "@/server/contract";
import { json, readJson } from "@/server/http";
import { gitErrorResponse, requireWorkspace } from "@/server/workspace-access";
import { checkoutBranch } from "@/lib/git-write";

const bodySchema = z.object({
  cwd: z.string(),
  branch: z.string(),
  create: z.boolean().optional(),
});

export const contract = routeContract({
  POST: {
    summary: "Check out a local branch (optionally create it)",
    request: { body: bodySchema },
    responses: {
      200: z.looseObject({ branch: z.string() }),
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
    return json(await checkoutBranch(gate.cwd, parsed.body));
  } catch (error) {
    return gitErrorResponse(error);
  }
}
