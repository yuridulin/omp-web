import { z } from "zod";
import { json } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { resolveSessionPathOr404 } from "@/lib/api-utils";
import { extractSubagentHistory } from "@/lib/subagent-history";
import { getRpcSession } from "@/lib/rpc-manager";

export const contract = routeContract({
  GET: {
    summary: "List the on-disk subagent roster recovered from a session's task results",
    responses: {
      200: z.looseObject({ subagents: z.array(z.unknown()) }),
      404: errorEnvelope,
      500: errorEnvelope,
    },
  },
});

/**
 * GET /api/agent/sessions/[id]/subagents
 *
 * On-disk subagent roster for a session, recovered from the parent file's task
 * toolResults (works without a live RPC process — survives page reloads).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const resolved = await resolveSessionPathOr404(id);
    if ("notFound" in resolved) {
      // A brand-new session's file can land just after the prompt
      // acknowledgement; while its RPC wrapper is alive that is "no on-disk
      // history yet", not "unknown session". The client treats an empty
      // roster the same as a 404, so answer 200 to keep the console clean.
      if (getRpcSession(id)?.isAlive()) {
        return json({ subagents: [] });
      }
      return json(resolved.notFound, { status: 404 });
    }
    const filePath = resolved.filePath;
    const subagents = extractSubagentHistory(filePath);
    return json({ subagents });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error), code: "internal_error" },
      { status: 500 },
    );
  }
}
