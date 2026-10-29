import { z } from "zod";
import { json, readJson } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { isValidNotificationId } from "@/lib/notification-events";
import { reportPresence } from "@/lib/notification-hub";
import { isRecord } from "@/lib/type-guards";

export const contract = routeContract({
  POST: {
    summary: "Report which session this tab shows so other tabs can suppress duplicate notifications",
    request: {
      body: z.object({
        clientId: z.string(),
        deviceId: z.string(),
        visible: z.boolean(),
        sessionId: z.union([z.string(), z.null()]).optional(),
        seq: z.number().int(),
      }),
    },
    responses: {
      204: null,
      400: errorEnvelope,
    },
  },
});

/** POST /api/system/notifications/presence { clientId, deviceId, visible, sessionId, seq } — which session this tab shows. */
export async function POST(req: Request) {
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.response;
  const body: unknown = parsed.body;
  if (
    !isRecord(body) || !isValidNotificationId(body.clientId) || !isValidNotificationId(body.deviceId)
    || typeof body.visible !== "boolean" || !Number.isSafeInteger(body.seq)
  ) {
    return json({ error: "Invalid presence report", code: "invalid_presence" }, { status: 400 });
  }
  const sessionId = typeof body.sessionId === "string" && body.sessionId ? body.sessionId : null;
  reportPresence({ clientId: body.clientId, deviceId: body.deviceId, visible: body.visible, sessionId, seq: Number(body.seq) });
  return new Response(null, { status: 204 });
}
