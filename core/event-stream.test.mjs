import assert from "node:assert/strict";
import { test } from "bun:test";

const {
  EVENT_STREAM_PATH,
  MUX_CONTROL_EVENT,
  UNKNOWN_CONNECTION_CODE,
  parseEventStreamChannel,
  parseEventStreamRequest,
} = await import("./event-stream.ts");

test("the wire constants are the documented ones", () => {
  assert.equal(EVENT_STREAM_PATH, "/api/events");
  assert.equal(MUX_CONTROL_EVENT, "mux");
  assert.equal(UNKNOWN_CONNECTION_CODE, "unknown_connection");
});

test("accepts every channel kind with a valid payload", () => {
  assert.deepEqual(parseEventStreamChannel({ kind: "running" }), { kind: "running" });
  assert.deepEqual(parseEventStreamChannel({ kind: "host-tools" }), { kind: "host-tools" });
  assert.deepEqual(parseEventStreamChannel({ kind: "session", sessionId: "abc" }), { kind: "session", sessionId: "abc" });
  assert.deepEqual(
    parseEventStreamChannel({ kind: "notifications", clientId: "abcdefgh" }),
    { kind: "notifications", clientId: "abcdefgh" },
  );
  assert.deepEqual(
    parseEventStreamChannel({ kind: "file", path: "/repo/a.ts" }),
    { kind: "file", path: "/repo/a.ts", sessionId: null },
  );
  assert.deepEqual(
    parseEventStreamChannel({ kind: "file", path: "/repo/a.ts", sessionId: "s1" }),
    { kind: "file", path: "/repo/a.ts", sessionId: "s1" },
  );
});

test("rejects malformed or unbounded channel payloads", () => {
  for (const value of [null, "running", 5, [], {}, { kind: "bogus" }, { kind: "__proto__" }]) {
    assert.equal(parseEventStreamChannel(value), null, JSON.stringify(value));
  }
  assert.equal(parseEventStreamChannel({ kind: "session" }), null);
  assert.equal(parseEventStreamChannel({ kind: "session", sessionId: "" }), null);
  assert.equal(parseEventStreamChannel({ kind: "session", sessionId: "x".repeat(513) }), null);
  assert.equal(parseEventStreamChannel({ kind: "file", path: "" }), null);
  assert.equal(parseEventStreamChannel({ kind: "file", path: "/a", sessionId: 5 }), null);
  // Notification client ids are strict: no whitespace and bounded length.
  assert.equal(parseEventStreamChannel({ kind: "notifications", clientId: "short" }), null);
  assert.equal(parseEventStreamChannel({ kind: "notifications", clientId: "has space" }), null);
});

test("subscription requests carry a connection id and an sN subscription id", () => {
  assert.deepEqual(
    parseEventStreamRequest({ connectionId: "c1", subscribe: { id: "s1", channel: { kind: "running" } } }),
    { connectionId: "c1", subscribe: { id: "s1", channel: { kind: "running" } } },
  );
  assert.deepEqual(
    parseEventStreamRequest({ connectionId: "c1", unsubscribe: "s42" }),
    { connectionId: "c1", unsubscribe: "s42" },
  );
});

test("invalid subscription ids never reach the mux", () => {
  for (const id of ["mux", "message", "s", "S1", "s01x", "s" + "9".repeat(16), ""]) {
    assert.equal(
      parseEventStreamRequest({ connectionId: "c1", subscribe: { id, channel: { kind: "running" } } }),
      null,
      id,
    );
  }
  assert.equal(parseEventStreamRequest({ connectionId: "c1", unsubscribe: "mux" }), null);
});

test("malformed requests and bad channels are rejected whole", () => {
  for (const value of [
    null,
    "x",
    {},
    { connectionId: "" },
    { connectionId: "c1" },
    { connectionId: "x".repeat(513), unsubscribe: "s1" },
    { connectionId: "c1", subscribe: { id: "s1" } },
    { connectionId: "c1", subscribe: { id: "s1", channel: { kind: "nope" } } },
    { connectionId: "c1", subscribe: { id: "s1", channel: { kind: "session" } } },
    { connectionId: "c1", unsubscribe: 5 },
  ]) {
    assert.equal(parseEventStreamRequest(value), null, JSON.stringify(value));
  }
});
