import { z } from "zod";
import { json } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { parseJsonWithinLimit, RequestBodyTooLargeError } from "@/lib/bounded-form-data";
import { clearHistory, listHistory, markHistoryRead, removeHistory } from "@/lib/notification-store";
import { isRecord } from "@/lib/type-guards";
import { notificationHistoryEntrySchema } from "@/server/schemas/system-ops";

export const contract = routeContract({
  GET: {
    summary: "List every persisted notification, newest first",
    responses: {
      200: z.looseObject({ entries: z.array(notificationHistoryEntrySchema) }),
    },
  },
  PATCH: {
    summary: "Mark notification history entries as read (at most 100 ids)",
    request: { body: z.object({ ids: z.array(z.string()) }) },
    responses: {
      200: z.looseObject({ ok: z.literal(true) }),
      400: errorEnvelope,
      413: errorEnvelope,
    },
  },
  DELETE: {
    summary: "Remove one history entry by id, or clear the whole history with all=1",
    request: { query: z.object({ id: z.string().optional(), all: z.string().optional() }) },
    responses: {
      200: z.looseObject({ ok: z.literal(true) }),
      400: errorEnvelope,
    },
  },
});

const MAX_BODY_BYTES = 32 * 1024;
const MAX_IDS = 100;
const MAX_ID_LENGTH = 256;

const invalid = () => json({ error: "Invalid history request", code: "invalid_history_request" }, { status: 400 });
const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH;

/** GET /api/system/notifications/history — every entry, newest first. */
export async function GET() {
  return json({ entries: listHistory() });
}

/** PATCH /api/system/notifications/history { ids } — mark entries read. A client marks what it shows, never entries it has not seen. */
export async function PATCH(req: Request) {
  let body: unknown;
  try {
    body = await parseJsonWithinLimit<unknown>(req, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return json({ error: "History request is too large", code: "request_too_large" }, { status: 413 });
    return invalid();
  }
  if (!isRecord(body) || !Array.isArray(body.ids) || body.ids.length > MAX_IDS || !body.ids.every(isId)) return invalid();
  markHistoryRead(body.ids);
  return json({ ok: true });
}

/**
 * DELETE /api/system/notifications/history?id=<id> removes one entry; ?all=1 clears the history.
 * Never a body: proxies may drop one, and a lost id must not become "clear everything".
 */
export async function DELETE(req: Request) {
  const params = new URL(req.url).searchParams;
  const id = params.get("id");
  if (isId(id)) removeHistory(id);
  else if (id === null && params.get("all") === "1") clearHistory();
  else return invalid();
  return json({ ok: true });
}
