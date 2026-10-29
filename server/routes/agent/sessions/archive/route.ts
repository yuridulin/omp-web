import { z } from "zod";
import { json, readJson } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { archivedSessionSchema } from "@/server/schemas/agent";
import { apiErrorBody } from "@/lib/api-utils";
import { listArchivedSessions, restoreArchivedSession } from "@/lib/omp/archive";
import { invalidateSessionListCache } from "@/lib/session-reader";
import type { ArchivedSessionInfo } from "@/lib/types";

export const contract = routeContract({
  GET: {
    summary: "List archived (gzip) sessions from omp's archive tree",
    responses: {
      200: z.looseObject({ archives: z.array(archivedSessionSchema) }),
      500: errorEnvelope,
    },
  },
  POST: {
    summary: "Restore an archived session back into the active session list",
    request: {
      body: z.looseObject({ key: z.string() }),
    },
    responses: {
      200: z.looseObject({ ok: z.literal(true), sessionId: z.string() }),
      400: errorEnvelope,
      404: errorEnvelope,
      409: errorEnvelope,
      500: errorEnvelope,
    },
  },
});

export async function GET() {
  try {
    const archives = await listArchivedSessions();
    const response: ArchivedSessionInfo[] = archives.map((archive) => ({
      key: archive.key,
      id: archive.id,
      cwd: archive.cwd,
      ...(archive.title ? { name: archive.title } : {}),
      created: archive.created.toISOString(),
      archivedAt: archive.archivedAt.toISOString(),
      messageCount: archive.messageCount,
      firstMessage: archive.firstMessage,
      size: archive.size,
      status: archive.status,
    }));
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
    const sessionId = restoreArchivedSession(body.key);
    invalidateSessionListCache();
    return json({ ok: true, sessionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("Invalid archive key") || message.includes("required") ? 400 : message.includes("not found") ? 404 : message.includes("already exists") ? 409 : 500;
    return json({ error: message, code: "archive_restore_failed" }, { status });
  }
}
