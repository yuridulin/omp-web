import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { DEFAULT_NOTIFICATION_PREFS } = await jiti.import("./notifications.ts");
const {
  PRESENCE_TTL_MS,
  routeNotification,
  presenceCoversSession,
  prunePresence,
  acceptPresence,
} = await jiti.import("./notification-routing.ts");

const event = { type: "completed", sessionId: "s1", sessionName: "Session" };
const prefs = (patch = {}) => ({ ...DEFAULT_NOTIFICATION_PREFS, enabled: true, ...patch });
const tab = (clientId, deviceId, patch = {}) => ({ clientId, deviceId, visible: false, sessionId: null, lastSeen: 0, ...patch });
const device = (deviceId, patch = {}) => ({ deviceId, prefs: prefs(), ...patch });
const subscription = { endpoint: "https://push.example/abc" };
const all = (...ids) => new Set(ids);

test("nothing is sent anywhere while a visible tab shows the session, even while its stream reconnects", () => {
  const presence = [tab("viewer", "desk", { visible: true, sessionId: "s1" }), tab("phone-tab", "phone")];
  const devices = [device("desk"), device("phone", { prefs: prefs({ whenActive: "system" }), subscription })];
  assert.deepEqual(routeNotification(event, presence, all("phone-tab"), devices), []);
});

test("active in another session: toast on the active tab only, toast-mode devices elsewhere stay quiet", () => {
  const presence = [tab("desk-active", "desk", { visible: true, sessionId: "other" }), tab("desk-hidden", "desk"), tab("laptop-tab", "laptop")];
  const devices = [device("desk"), device("laptop")];
  assert.deepEqual(routeNotification(event, presence, all("desk-active", "desk-hidden", "laptop-tab"), devices), [{ kind: "toast", clientId: "desk-active" }]);
});

test("a visible tab that cannot receive toasts (stream closed) does not silence other devices", () => {
  const presence = [tab("settings-open", "desk", { visible: true })];
  const devices = [device("desk"), device("phone", { subscription })];
  assert.deepEqual(routeNotification(event, presence, all(), devices), [{ kind: "push", deviceId: "phone" }]);
});

test("'always send a system notification' devices still get one while the user is active elsewhere", () => {
  const presence = [tab("desk-active", "desk", { visible: true, sessionId: "other" })];
  const devices = [device("desk", { prefs: prefs({ whenActive: "system" }) }), device("phone", { prefs: prefs({ whenActive: "system" }), subscription })];
  assert.deepEqual(routeNotification(event, presence, all("desk-active"), devices), [
    { kind: "os", clientId: "desk-active" },
    { kind: "push", deviceId: "phone" },
  ]);
});

test("nobody active: push to subscribed devices, in-page to reachable tabs of unsubscribed ones", () => {
  const presence = [tab("desk-tab", "desk"), tab("phone-tab", "phone"), tab("beacon-only", "laptop")];
  const devices = [device("desk"), device("phone", { subscription }), device("laptop")];
  assert.deepEqual(routeNotification(event, presence, all("desk-tab", "phone-tab"), devices), [
    { kind: "os", clientId: "desk-tab" },
    { kind: "push", deviceId: "phone" },
  ]);
});

test("a tab still showing a moved session's old id counts as viewing it", () => {
  const presence = [tab("viewer", "desk", { visible: true, sessionId: "old-id" })];
  const moved = { ...event, sessionId: "new-id", aliases: ["old-id"] };
  assert.deepEqual(routeNotification(moved, presence, all("viewer"), [device("desk", { subscription })]), []);
});

test("disabled devices and disabled types get nothing; tests are never routed", () => {
  const presence = [tab("tab", "desk")];
  assert.deepEqual(routeNotification(event, presence, all("tab"), [device("desk", { prefs: prefs({ enabled: false }) })]), []);
  assert.deepEqual(routeNotification(event, presence, all("tab"), [device("desk", { prefs: prefs({ types: { ...DEFAULT_NOTIFICATION_PREFS.types, completed: false } }) })]), []);
  assert.deepEqual(routeNotification({ ...event, type: "test" }, presence, all("tab"), [device("desk", { subscription })]), []);
});

test("presence expires after the TTL and out-of-order reports are refused", () => {
  const now = 1_000_000;
  const presence = [
    tab("fresh", "desk", { lastSeen: now - PRESENCE_TTL_MS }),
    tab("stale", "desk", { lastSeen: now - PRESENCE_TTL_MS - 1 }),
  ];
  assert.deepEqual(prunePresence(presence, now).map((entry) => entry.clientId), ["fresh"]);
  assert.equal(prunePresence(presence, now, 10).length, 0);

  assert.equal(acceptPresence(undefined, { seq: 1 }), true);
  assert.equal(acceptPresence({ seq: 1 }, { seq: 1 }), true);
  assert.equal(acceptPresence({ seq: 2 }, { seq: 1 }), false);
});

test("session coverage needs a visible tab on the session or an alias", () => {
  assert.equal(presenceCoversSession(event, [tab("t", "d", { visible: false, sessionId: "s1" })]), false);
  assert.equal(presenceCoversSession(event, [tab("t", "d", { visible: true, sessionId: null })]), false);
  assert.equal(presenceCoversSession(event, [tab("t", "d", { visible: true, sessionId: "s1" })]), true);
});
