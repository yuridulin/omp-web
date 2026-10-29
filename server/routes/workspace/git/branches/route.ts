import { z } from "zod";
import { errorEnvelope, routeContract } from "@/server/contract";
import { json } from "@/server/http";
import { gitErrorResponse, requireWorkspace } from "@/server/workspace-access";
import { gitBranchSchema } from "@/server/schemas/git";
import { listBranches } from "@/lib/git-write";

const querySchema = z.object({ cwd: z.string() });

export const contract = routeContract({
  GET: {
    summary: "List local branches and the current branch",
    request: { query: querySchema },
    responses: {
      200: z.looseObject({
        current: z.string().nullable(),
        branches: z.array(gitBranchSchema),
      }),
      400: errorEnvelope,
      403: errorEnvelope,
    },
  },
});

export async function GET(req: Request) {
  const cwd = new URL(req.url).searchParams.get("cwd");
  const gate = await requireWorkspace(cwd);
  if (!gate.ok) return gate.response;
  try {
    return json(await listBranches(gate.cwd));
  } catch (error) {
    return gitErrorResponse(error);
  }
}
