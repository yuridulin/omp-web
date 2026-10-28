import type { NotificationEvent, NotificationPrefs } from "./notifications";

/**
 * Server-side notification routing: which tabs and devices receive one event.
 *
 * Presence (what a tab last reported) and reachability (tabs with an open
 * stream) are deliberately separate: streams reconnect and overlap while the
 * tab stays put, so they cannot be the presence signal. Routing is a total
 * function so it can be exercised without any transport.
 */

/** A tab counts as present this long after its last presence report. */
export const PRESENCE_TTL_MS = 60_000;

/** What a tab last reported. Written only by presence reports, pruned by TTL. */
export interface NotificationPresence {
  clientId: string;
  deviceId: string;
  /** Visible AND the user was active within the presence window. */
  visible: boolean;
  sessionId: string | null;
  /** Per-tab report counter: requests can arrive out of order, and only the newest counts. */
  seq: number;
  lastSeen: number;
}

export interface NotificationMessage {
  kind: "toast" | "os";
  event: NotificationEvent;
}

export type Delivery =
  | { kind: "toast" | "os"; clientId: string }
  | { kind: "push"; deviceId: string };

/** The device fields routing needs; the host store carries the rest. */
export interface NotificationDeviceTarget {
  deviceId: string;
  prefs: Pick<NotificationPrefs, "enabled" | "types" | "whenActive">;
  subscription?: { endpoint: string } | null;
}

/** Drop expired presence entries; only the live ones may be routed over. */
export function prunePresence(
  presence: Iterable<NotificationPresence>,
  now: number,
  ttlMs = PRESENCE_TTL_MS,
): NotificationPresence[] {
  return [...presence].filter((tab) => now - tab.lastSeen <= ttlMs);
}

/** A report older than the stored one from the same tab is out of order. */
export function acceptPresence(current: { seq: number } | undefined, report: { seq: number }): boolean {
  return current === undefined || current.seq <= report.seq;
}

/** A visible tab is showing the event's conversation (under any of its ids). */
export function presenceCoversSession(event: NotificationEvent, presence: readonly NotificationPresence[]): boolean {
  const viewedAs = new Set([event.sessionId, ...(event.aliases ?? [])]);
  return presence.some((tab) => tab.visible && tab.sessionId !== null && viewedAs.has(tab.sessionId));
}

/**
 * Decide where one event goes. `reachable` holds the tabs with an open stream.
 *
 * 1. A visible tab is showing the session: nothing, for every device.
 * 2. The user is active in some reachable tab and the device prefers toasts:
 *    toast to that device's active tabs only (other devices stay quiet).
 * 3. Otherwise a system notification: push when the device has a subscription,
 *    else in-page on each of its reachable tabs.
 */
export function routeNotification(
  event: NotificationEvent,
  presence: readonly NotificationPresence[],
  reachable: ReadonlySet<string>,
  devices: readonly NotificationDeviceTarget[],
): Delivery[] {
  if (event.type === "test") return [];
  if (presenceCoversSession(event, presence)) return [];
  const active = presence.filter((tab) => tab.visible && reachable.has(tab.clientId));
  const deliveries: Delivery[] = [];
  for (const device of devices) {
    if (!device.prefs.enabled || !device.prefs.types[event.type]) continue;
    if (active.length > 0 && device.prefs.whenActive === "toast") {
      for (const tab of active) if (tab.deviceId === device.deviceId) deliveries.push({ kind: "toast", clientId: tab.clientId });
    } else if (device.subscription) {
      deliveries.push({ kind: "push", deviceId: device.deviceId });
    } else {
      for (const tab of presence) {
        if (tab.deviceId === device.deviceId && reachable.has(tab.clientId)) deliveries.push({ kind: "os", clientId: tab.clientId });
      }
    }
  }
  return deliveries;
}
