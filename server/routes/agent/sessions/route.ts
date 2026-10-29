import { z } from "zod";
import { json } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { runningSessionSchema, sessionSummarySchema } from "@/server/schemas/agent";
import { createHash } from "crypto";
import { listAllSessions } from "@/lib/session-reader";
import { getRunningRpcSessions } from "@/lib/rpc-manager";

// The session list mixes on-disk sessions with the live runningSessionIds set,
// which changes on every agent turn, so it must never be cached by proxies or
// the browser. An ETag is still computed so conditional GETs short-circuit to
// a 304 when nothing changed (cheap client-side polling, server-side response
// body skipped).
const SESSION_LIST_HEADERS = {
  "Cache-Control": "no-store",
  Vary: "Cookie",
} as const;

export const contract = routeContract({
  GET: {
    summary: "List on-disk sessions with their live running child ids",
    responses: {
      200: z.looseObject({
        sessions: z.array(sessionSummarySchema),
        runningSessionIds: z.array(z.string()),
        runningSessions: z.array(runningSessionSchema),
      }),
      304: null,
      500: errorEnvelope,
    },
  },
});

export async function GET(req: Request) {
  try {
    const sessions = await listAllSessions();
    const runningSessions = getRunningRpcSessions();
    const runningSessionIds = runningSessions.map((s) => s.id);
    const body = { sessions, runningSessionIds, runningSessions };
    const bodyJson = JSON.stringify(body);
    const etag = `"${createHash("sha1").update(bodyJson).digest("hex").slice(0, 16)}"`;
    if (req.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag, ...SESSION_LIST_HEADERS } });
    }
    return new Response(bodyJson, { headers: { ETag: etag, "Content-Type": "application/json", ...SESSION_LIST_HEADERS } });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error), code: "internal_error" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
