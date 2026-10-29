import { z } from "zod";
import { json } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { sessionContextSchema } from "@/server/schemas/agent";
import { existsSync } from "fs";
import { loadSessionFile } from "@/lib/omp/session-files";
import { buildSessionContext, getSessionContextBoundary, getSessionEntriesForDisplayAsync, getSessionHistoryPage, readSessionHeader, SessionFileTooLargeError } from "@/lib/session-reader";
import { apiErrorBody, resolveSessionPathOr404 } from "@/lib/api-utils";
import { getRpcSession } from "@/lib/rpc-manager";
import { getSessionAuthority } from "@/lib/session-authority";
import { MAX_SYNC_MESSAGES, parseHistoryCursor, selectSessionHistory, type SessionHistoryCursor, type SessionSyncResponse } from "@/lib/session-sync";

/** Uniform error mapping for this route: the display read throws
 * SessionFileTooLargeError on files past the load ceiling, which must surface
 * as the same 413 the null-header path returns — not a 500 so the frontend
 * does not treat history as gone. */
function contextErrorResponse(error: unknown): Response {
  if (error instanceof SessionFileTooLargeError) {
    return json(
      { error: "Session file is too large to open in omp-web", code: "session_file_too_large" },
      { status: 413 },
    );
  }
  return json(apiErrorBody(error), { status: 500 });
}

export const contract = routeContract({
  GET: {
    summary: "Read a session transcript context (full, boundary ids, or an incremental sync page)",
    request: {
      query: z.object({
        leafId: z.string().optional(),
        deferThinking: z.string().optional(),
        deferMedia: z.string().optional(),
        includePreCompaction: z.string().optional(),
        sync: z.enum(["1"]).optional(),
        boundary: z.enum(["1"]).optional(),
        cursor: z.string().optional(),
        limit: z.string().optional(),
      }),
    },
    responses: {
      200: z.looseObject({
        context: sessionContextSchema.optional(),
        entryIds: z.array(z.string()).optional(),
        sessionId: z.string().optional(),
        leafId: z.string().nullable().optional(),
        live: z.unknown().nullable().optional(),
        snapshot: z.unknown().nullable().optional(),
        mode: z.enum(["append", "replace"]).optional(),
        baseEntryId: z.string().nullable().optional(),
        cursor: z.unknown().optional(),
        hasMore: z.boolean().optional(),
      }),
      400: errorEnvelope,
      404: errorEnvelope,
      413: errorEnvelope,
      500: errorEnvelope,
    },
  },
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(req.url);
  const leafId = url.searchParams.get("leafId") ?? undefined;
  const deferThinking = url.searchParams.has("deferThinking");
  const deferToolResultImages = url.searchParams.has("deferMedia");
  // Read-only transcript mode: include entries omitted from the active agent context.
  const includePreCompaction = url.searchParams.has("includePreCompaction");
  const sync = url.searchParams.get("sync");
  const boundary = url.searchParams.get("boundary");
  if (boundary !== null) {
    if (boundary !== "1" || url.searchParams.getAll("boundary").length !== 1) {
      return json({ error: "Invalid boundary mode", code: "invalid_boundary" }, { status: 400 });
    }
    if (["sync", "leafId", "includePreCompaction", "cursor", "limit"].some((option) => url.searchParams.has(option))) {
      return json({ error: "Boundary mode requires the current active context", code: "invalid_boundary_options" }, { status: 400 });
    }
  }
  let cursor: SessionHistoryCursor | null = null;
  let limit = MAX_SYNC_MESSAGES;
  if (sync !== null && sync !== "1") {
    return json({ error: "Invalid sync mode", code: "invalid_sync" }, { status: 400 });
  }
  if (sync === "1") {
    try {
      cursor = parseHistoryCursor(url.searchParams.get("cursor"));
    } catch {
      return json({ error: "Invalid history cursor", code: "invalid_sync_cursor" }, { status: 400 });
    }
    const rawLimit = url.searchParams.get("limit");
    if (rawLimit !== null) {
      limit = Number(rawLimit);
      if (!/^[1-9]\d*$/.test(rawLimit) || !Number.isInteger(limit) || limit > MAX_SYNC_MESSAGES) {
        return json({ error: "Invalid history page limit", code: "invalid_sync_limit" }, { status: 400 });
      }
    }
  }

  try {
    const resolved = await resolveSessionPathOr404(id);
    if ("notFound" in resolved) {
      // OMP may not create the file until the first assistant message is
      // committed. A live wrapper can still recover that first partial reply,
      // and its persisted boundary is empty (the next prompt must not 404).
      // Never replace previously confirmed history when its file is missing.
      const session = boundary === "1" || (sync === "1" && !cursor?.lastEntryId && leafId === undefined) ? getRpcSession(id) : undefined;
      if (session?.isAlive() && !existsSync(session.sessionFile)) {
        if (boundary === "1") {
          return json({ entryIds: [] }, { headers: { "Cache-Control": "no-store" } });
        }
        const response: SessionSyncResponse = {
          ...selectSessionHistory(buildSessionContext([]), cursor, limit),
          sessionId: id,
          leafId: null,
          live: session.getStreamSnapshot(),
          snapshot: getSessionAuthority(id)?.snapshot ?? null,
        };
        return json(response, { headers: { "Cache-Control": "no-store" } });
      }
      return json(resolved.notFound, { status: 404 });
    }
    const filePath = resolved.filePath;

    const header = readSessionHeader(filePath);
    if (header === null) {
      const loaded = loadSessionFile(filePath, { resolveBlobs: false });
      if (loaded.error === "too_large") {
        return json(
          { error: "Session file is too large to open in omp-web", code: "session_file_too_large" },
          { status: 413 },
        );
      }
      return json({ error: "Session file is missing or malformed", code: "session_file_malformed" }, { status: 404 });
    }
    if (boundary === "1") {
      return json(getSessionContextBoundary(filePath), { headers: { "Cache-Control": "no-store" } });
    }
    if (sync === "1") {
      const page = await getSessionHistoryPage(filePath, cursor, limit, leafId, {
        deferThinking,
        deferToolResultImages,
        includePreCompaction,
      });
      // Sample AFTER the disk read: a quiet active run still supplies its most
      // recent partial output, and events arriving during the read win.
      const session = getRpcSession(id);
      const live = session?.isAlive() && (leafId === undefined || leafId === page.tipId)
        ? session.getStreamSnapshot()
        : null;
      const snapshot = live ? getSessionAuthority(id)?.snapshot ?? null : null;
      const response: SessionSyncResponse = { ...page.history, sessionId: id, leafId: page.leafId, live, snapshot };
      return json(response, { headers: { "Cache-Control": "no-store" } });
    }
    // Deduplicated cached read; blob resolution on per-entry deep copies.
    const entries = await getSessionEntriesForDisplayAsync(filePath, { skipToolResultImages: deferToolResultImages });
    const context = buildSessionContext(entries, leafId, {
      deferThinking,
      deferToolResultImages,
      includePreCompaction,
    });

    return json({ context });
  } catch (error) {
    return contextErrorResponse(error);
  }
}
