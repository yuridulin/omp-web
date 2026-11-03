import { statSync } from "fs";
import { z } from "zod";
import { json, readJson } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { archivedSessionSchema } from "@/server/schemas/agent";
import { apiErrorBody } from "@/lib/api-utils";
import {
  loadSessionArchiveRegistry,
  restoreSession,
  saveSessionArchiveRegistry,
} from "@/lib/session-archive-registry";
import { invalidateSessionListCache, listAllSessions } from "@/lib/session-reader";
import type { ArchivedSessionInfo } from "@/lib/types";

export const contract = routeContract({
  GET: {
    summary: "List sessions marked archived in omp-web",
    responses: {
      200: z.looseObject({ archives: z.array(archivedSessionSchema) }),
      500: errorEnvelope,
    },
  },
  POST: {
    summary: "Restore an archived session (clears the omp-web archive marker)",
    request: {
      body: z.looseObject({ key: z.string() }),
    },
    responses: {
      200: z.looseObject({ ok: z.literal(true), sessionId: z.string() }),
      400: errorEnvelope,
      404: errorEnvelope,
      500: errorEnvelope,
    },
  },
});

export async function GET() {
  try {
    const sessions = await listAllSessions();
    const times = new Map(
      loadSessionArchiveRegistry().sessions.map((entry) => [entry.id, entry.archivedAt]),
    );
    const response: ArchivedSessionInfo[] = [];
    for (const session of sessions) {
      const archivedAt = times.get(session.id);
      if (!archivedAt) continue;
      let size = 0;
      try {
        size = statSync(session.path).size;
      } catch {
        // The file vanished between the scan and the stat; the row stays usable.
      }
      response.push({
        key: session.id,
        id: session.id,
        cwd: session.cwd,
        ...(session.name ? { name: session.name } : {}),
        created: session.created,
        archivedAt,
        messageCount: session.messageCount,
        firstMessage: session.firstMessage,
        size,
      });
    }
    response.sort((a, b) => Date.parse(b.archivedAt) - Date.parse(a.archivedAt));
    return json({ archives: response }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return json(apiErrorBody(error), { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const parsed = await readJson<{ key?: unknown }>(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;
    if (typeof body.key !== "string" || !body.key.trim()) {
      return json({ error: "Archive key is required", code: "archive_key_required" }, { status: 400 });
    }
    const sessionId = body.key.trim();
    const registry = loadSessionArchiveRegistry();
    const next = restoreSession(registry, sessionId);
    if (next === registry) {
      return json({ error: "Archived session not found", code: "archive_not_found" }, { status: 404 });
    }
    saveSessionArchiveRegistry(next);
    invalidateSessionListCache();
    return json({ ok: true, sessionId });
  } catch (error) {
    return json(apiErrorBody(error), { status: 500 });
  }
}
