import { z } from "zod";
import { json } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { exitedSessionSchema } from "@/server/schemas/agent";
import { getExitedRpcSession, getRpcSession, WebRpcError } from "@/lib/rpc-manager";
import { getSessionAuthority } from "@/lib/session-authority-registry";
import { apiErrorBody, resolveSessionPathOr404 } from "@/lib/api-utils";

export const contract = routeContract({
  GET: {
    summary: "Read a session's live omp state and the server authority's core snapshot",
    responses: {
      200: z.looseObject({
        running: z.boolean(),
        state: z.unknown().optional(),
        snapshot: z.unknown().optional(),
        exited: exitedSessionSchema.optional(),
        recovered: z.literal(true).optional(),
      }),
      404: errorEnvelope,
      500: errorEnvelope,
    },
  },
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    // A live process proves the session exists: omp does not create the session
    // file until the history holds an assistant message, so the path check
    // below would 404 a brand-new running session.
    const rpc = getRpcSession(id);
    if (rpc?.isAlive()) {
      try {
        const state = await rpc.send({ type: "get_state" });
        const authority = getSessionAuthority(id);
        await authority?.refreshHistory();
        // `state` is omp's own snapshot; `snapshot` is the server authority's
        // core model. Clients render the latter and treat the former as detail.
        return json({ running: true, state, snapshot: authority?.snapshot });
      } catch (error) {
        if (error instanceof WebRpcError && error.code === "session_unresponsive") {
          return json({ running: false, recovered: true });
        }
        throw error;
      }
    }

    const exited = getExitedRpcSession(id);
    if (exited) return json({ running: false, exited });

    const resolved = await resolveSessionPathOr404(id);
    if ("notFound" in resolved) return json(resolved.notFound, { status: 404 });
    return json({ running: false });
  } catch (error) {
    return json(apiErrorBody(error), { status: 500 });
  }
}
