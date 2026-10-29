import { z } from "zod";
import { json } from "@/server/http";
import { routeContract } from "@/server/contract";
import { parseJsonWithinLimit, RequestBodyTooLargeError } from "@/lib/bounded-form-data";
import { MAX_AGENT_COMMAND_REQUEST_BYTES } from "@/lib/image-attachments";
import { parseChatIntent } from "@/core/commands";
import { getSessionAuthority } from "@/lib/session-authority-registry";
import { chatIntentSchema } from "./schema";

export const contract = routeContract({
  POST: {
    summary: "Dispatch a chat intent through the session's core state machine",
    request: { body: chatIntentSchema },
    responses: {
      200: z.looseObject({ ok: z.literal(true), data: z.unknown().optional() }),
      400: z.looseObject({ error: z.string(), code: z.string() }),
      409: z.looseObject({ error: z.string(), code: z.string() }),
    },
  },
});

/**
 * POST /api/agent/sessions/[id]/intent — the authoritative command surface.
 *
 * The body is a `ChatIntent` (see core/commands). The server dispatches it
 * through the session's core machine, which owns the state and translates the
 * intent into the omp frame; clients render the resulting snapshot.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await parseJsonWithinLimit(req, MAX_AGENT_COMMAND_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return json({ error: "Chat intent is too large", code: "request_too_large" }, { status: 413 });
    }
    return json({ error: "Invalid JSON request body", code: "invalid_json" }, { status: 400 });
  }

  const intent = parseChatIntent(body);
  if (!intent) {
    return json({ error: "Invalid chat intent", code: "invalid_intent" }, { status: 400 });
  }

  const authority = getSessionAuthority(id);
  if (!authority) {
    return json(
      { error: "Session is not managed by omp-web", code: "session_not_managed" },
      { status: 409 },
    );
  }

  try {
    const result = await authority.dispatch(intent);
    if (!result.ok) {
      return json(
        { error: result.reason ?? "Intent refused", code: "intent_refused" },
        { status: 409 },
      );
    }
    return json(result.data === undefined ? { ok: true } : { ok: true, data: result.data });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error), code: "intent_failed" },
      { status: 500 },
    );
  }
}
