import { z } from "zod";
import { json } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { resolveSessionPathOr404 } from "@/lib/api-utils";
import {
  archiveSessions,
  loadSessionArchiveRegistry,
  saveSessionArchiveRegistry,
} from "@/lib/session-archive-registry";
import { invalidateSessionListCache } from "@/lib/session-reader";

export const contract = routeContract({
  POST: {
    summary: "Mark a session archived in omp-web (the omp session file is untouched)",
    responses: {
      200: z.looseObject({
        ok: z.literal(true),
        archived: z.literal(true),
      }),
      404: errorEnvelope,
      500: errorEnvelope,
    },
  },
});

/**
 * POST /api/agent/sessions/[id]/archive — UI-only marker.
 *
 * Archiving changes nothing for omp: the child keeps running, the JSONL and its
 * artifacts stay in the active sessions tree, and the session remains readable
 * and resumable. Only the rail stops painting the row, so no live child is
 * stopped and no file is moved.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const resolved = await resolveSessionPathOr404(id);
    if ("notFound" in resolved) return json(resolved.notFound, { status: 404 });

    const registry = loadSessionArchiveRegistry();
    const next = archiveSessions(registry, [id]);
    if (next !== registry) saveSessionArchiveRegistry(next);
    // The list ships the archived flag, so its 30s cache must drop.
    invalidateSessionListCache();
    return json({ ok: true, archived: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message, code: "session_archive_failed" }, { status: 500 });
  }
}
