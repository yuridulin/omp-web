import { z } from "zod";
import { json } from "@/server/http";
import { routeContract } from "@/server/contract";
import { parseJsonWithinLimit, RequestBodyTooLargeError } from "@/lib/bounded-form-data";
import { EventStreamConnection, getEventStreamConnection } from "@/lib/event-stream-hub";
import { parseEventStreamRequest, UNKNOWN_CONNECTION_CODE } from "@/lib/event-stream-protocol";

const MAX_REQUEST_BYTES = 16 * 1024;

const eventStreamError = z.looseObject({ error: z.string(), code: z.string() });

export const contract = routeContract({
  GET: {
    summary: "Open the browser's multiplexed SSE stream for live agent events",
    responses: {
      200: { contentType: "text/event-stream" },
    },
  },
  POST: {
    summary: "Subscribe or unsubscribe a subscription on an open event stream connection",
    request: {
      body: z.looseObject({
        connectionId: z.string(),
        subscribe: z
          .looseObject({
            id: z.string(),
            channel: z.looseObject({
              kind: z.enum(["running", "notifications", "session", "file", "workspace", "lsp", "host-tools"]),
              clientId: z.string().optional(),
              sessionId: z.string().optional(),
              path: z.string().optional(),
              root: z.string().optional(),
            }),
          })
          .optional(),
        unsubscribe: z.string().optional(),
      }),
    },
    responses: {
      200: z.looseObject({ ok: z.literal(true) }),
      400: eventStreamError,
      404: eventStreamError,
      413: eventStreamError,
      500: eventStreamError,
    },
  },
});

// GET /api/agent/events — the browser's single multiplexed live-event stream.
// Subscriptions are attached with POST (see lib/event-stream-protocol.ts).
export function GET(req: Request) {
  const connection = new EventStreamConnection(req.signal);
  return new Response(connection.stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// POST /api/agent/events — { connectionId, subscribe: { id, channel } } | { connectionId, unsubscribe }
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await parseJsonWithinLimit(req, MAX_REQUEST_BYTES);
  } catch (error) {
    const status = error instanceof RequestBodyTooLargeError ? 413 : 400;
    return json({ error: "Invalid event stream request", code: "invalid_event_stream_request" }, { status });
  }
  const request = parseEventStreamRequest(body);
  if (!request) {
    return json({ error: "Invalid event stream request", code: "invalid_event_stream_request" }, { status: 400 });
  }
  const connection = getEventStreamConnection(request.connectionId);
  if (!connection) {
    return json({ error: "Unknown event stream connection", code: UNKNOWN_CONNECTION_CODE }, { status: 404 });
  }
  if ("unsubscribe" in request) {
    connection.unsubscribe(request.unsubscribe);
    return json({ ok: true });
  }
  const result = await connection.subscribe(request.subscribe.id, request.subscribe.channel);
  return result.ok
    ? json({ ok: true })
    : json({ error: result.error, code: result.code }, { status: result.status });
}
