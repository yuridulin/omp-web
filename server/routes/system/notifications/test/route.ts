import { z } from "zod";
import { json, readJson } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { isValidNotificationId } from "@/lib/notification-events";
import { sendTestPush } from "@/lib/notification-hub";
import { isRecord } from "@/lib/type-guards";

export const contract = routeContract({
  POST: {
    summary: "Send one test push notification to a device",
    request: { body: z.object({ deviceId: z.string() }) },
    responses: {
      204: null,
      400: errorEnvelope,
      502: errorEnvelope,
    },
  },
});

/** POST /api/system/notifications/test { deviceId } — one push to this device; 502 when the push service refuses it. */
export async function POST(req: Request) {
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.response;
  const body: unknown = parsed.body;
  if (!isRecord(body) || !isValidNotificationId(body.deviceId)) {
    return json({ error: "deviceId is required", code: "invalid_device" }, { status: 400 });
  }
  const result = await sendTestPush(body.deviceId);
  return result.ok ? new Response(null, { status: 204 }) : json({ error: result.error, code: "push_failed" }, { status: 502 });
}
