import { z } from "zod";
import { json, readJson } from "@/server/http";
import { errorEnvelope, routeContract } from "@/server/contract";
import { isValidNotificationId, parseNotificationPrefs } from "@/lib/notification-events";
import { getVapidPublicKey } from "@/lib/notification-hub";
import { getDevice, parsePushSubscription, saveDevice } from "@/lib/notification-store";
import { isRecord } from "@/lib/type-guards";

export const contract = routeContract({
  GET: {
    summary: "Return the VAPID public key and whether this device has a push subscription",
    request: { query: z.object({ deviceId: z.string().optional() }) },
    responses: {
      200: z.looseObject({ publicKey: z.string(), subscribed: z.boolean() }),
    },
  },
  PUT: {
    summary: "Store this device's notification prefs and optional push subscription (an omitted subscription keeps the stored one)",
    request: {
      body: z.object({
        deviceId: z.string(),
        prefs: z.unknown().optional(),
        subscription: z.unknown().optional(),
      }),
    },
    responses: {
      200: z.looseObject({ subscribed: z.boolean() }),
      400: errorEnvelope,
    },
  },
});

/** GET /api/system/notifications/devices?deviceId= — VAPID public key and whether this device has a push subscription. */
export async function GET(req: Request) {
  const deviceId = new URL(req.url).searchParams.get("deviceId");
  const device = isValidNotificationId(deviceId) ? getDevice(deviceId) : undefined;
  return json({ publicKey: getVapidPublicKey(), subscribed: Boolean(device?.subscription) });
}

/** PUT /api/system/notifications/devices { deviceId, prefs, subscription? } — an omitted subscription keeps the stored one. */
export async function PUT(req: Request) {
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.response;
  const body: unknown = parsed.body;
  if (!isRecord(body) || !isValidNotificationId(body.deviceId)) {
    return json({ error: "deviceId is required", code: "invalid_device" }, { status: 400 });
  }
  const subscription = body.subscription === undefined ? undefined : parsePushSubscription(body.subscription);
  if (subscription === null) return json({ error: "Invalid push subscription", code: "invalid_subscription" }, { status: 400 });
  const device = saveDevice(body.deviceId, parseNotificationPrefs(body.prefs), subscription);
  return json({ subscribed: Boolean(device.subscription) });
}
