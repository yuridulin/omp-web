import assert from "node:assert/strict";
import { test } from "bun:test";

const { EventStreamConnection, getEventStreamConnection } = await import("./event-stream-hub.ts");

test("an already aborted request does not publish a connection id", async () => {
  const abort = new AbortController();
  abort.abort();
  const connection = new EventStreamConnection(abort.signal);
  const reader = connection.stream.getReader();
  const first = await reader.read();
  assert.equal(first.done, true);
  assert.equal(getEventStreamConnection(connection.id), undefined);
  assert.equal(connection.isClosed, true);
});

test("the subagents channel refuses an unknown session and never opens it", async () => {
  const connection = new EventStreamConnection();
  try {
    const result = await connection.subscribe("s1", { kind: "subagents", sessionId: "no-such-session" });
    assert.equal(result.ok, false);
    assert.equal(result.status, 404);
    assert.equal(result.code, "session_not_found");
  } finally {
    connection.close();
  }
});
