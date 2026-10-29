import { test } from "bun:test";
import assert from "node:assert/strict";

const { createMessageUpdateCoalescer } = await import("./coalescer.ts");

/** Manual scheduler: collects flush callbacks so tests control flush timing. */
function manualScheduler() {
  const scheduled = [];
  let cancelled = 0;
  const schedule = (flush) => {
    const entry = { flush, cancelled: false };
    scheduled.push(entry);
    return () => {
      entry.cancelled = true;
      cancelled += 1;
    };
  };
  const fire = () => {
    for (const entry of scheduled.splice(0)) {
      if (!entry.cancelled) entry.flush();
    }
  };
  return { schedule, fire, get cancelledCount() { return cancelled; } };
}

test("buffers message_update and dispatches only the latest on flush", () => {
  const dispatched = [];
  const scheduler = manualScheduler();
  const coalescer = createMessageUpdateCoalescer((e) => dispatched.push(e), scheduler.schedule);

  coalescer.push({ type: "message_update", seq: 1 });
  coalescer.push({ type: "message_update", seq: 2 });
  coalescer.push({ type: "message_update", seq: 3 });
  assert.equal(dispatched.length, 0);

  scheduler.fire();
  assert.deepEqual(dispatched, [{ type: "message_update", seq: 3 }]);
});

test("flushes the pending update before any other event type", () => {
  const dispatched = [];
  const scheduler = manualScheduler();
  const coalescer = createMessageUpdateCoalescer((e) => dispatched.push(e), scheduler.schedule);

  coalescer.push({ type: "message_update", seq: 1 });
  coalescer.push({ type: "tool_execution_start", toolCallId: "t1" });
  assert.deepEqual(dispatched.map((e) => e.type), ["message_update", "tool_execution_start"]);
  assert.equal(dispatched[0].seq, 1);

  scheduler.fire();
  assert.equal(dispatched.length, 2);
});

test("message_end supersedes the pending update", () => {
  const dispatched = [];
  const scheduler = manualScheduler();
  const coalescer = createMessageUpdateCoalescer((e) => dispatched.push(e), scheduler.schedule);

  coalescer.push({ type: "message_update", seq: 1 });
  coalescer.push({ type: "message_end", seq: 2 });
  assert.deepEqual(dispatched.map((e) => e.type), ["message_end"]);

  scheduler.fire();
  assert.equal(dispatched.length, 1);
});

test("continues coalescing after a flush", () => {
  const dispatched = [];
  const scheduler = manualScheduler();
  const coalescer = createMessageUpdateCoalescer((e) => dispatched.push(e), scheduler.schedule);

  coalescer.push({ type: "message_update", seq: 1 });
  scheduler.fire();
  coalescer.push({ type: "message_update", seq: 2 });
  scheduler.fire();
  assert.deepEqual(dispatched.map((e) => e.seq), [1, 2]);
});

test("non-update events pass through immediately when nothing is pending", () => {
  const dispatched = [];
  const scheduler = manualScheduler();
  const coalescer = createMessageUpdateCoalescer((e) => dispatched.push(e), scheduler.schedule);

  coalescer.push({ type: "agent_start" });
  coalescer.push({ type: "notice", message: "hi" });
  assert.deepEqual(dispatched.map((e) => e.type), ["agent_start", "notice"]);
});

test("reset drops the pending update and cancels the scheduled flush", () => {
  const dispatched = [];
  const scheduler = manualScheduler();
  const coalescer = createMessageUpdateCoalescer((e) => dispatched.push(e), scheduler.schedule);

  coalescer.push({ type: "message_update", seq: 1 });
  coalescer.reset();
  scheduler.fire();
  assert.equal(dispatched.length, 0);
  assert.equal(scheduler.cancelledCount, 1);
});

test("coalesces tool_execution_update per tool call and keeps each tool's latest", () => {
  const dispatched = [];
  const scheduler = manualScheduler();
  const coalescer = createMessageUpdateCoalescer((e) => dispatched.push(e), scheduler.schedule);

  coalescer.push({ type: "tool_execution_update", toolCallId: "a", chunk: 1 });
  coalescer.push({ type: "tool_execution_update", toolCallId: "b", chunk: 1 });
  coalescer.push({ type: "tool_execution_update", toolCallId: "a", chunk: 2 });
  assert.equal(dispatched.length, 0);

  scheduler.fire();
  assert.deepEqual(dispatched, [
    { type: "tool_execution_update", toolCallId: "a", chunk: 2 },
    { type: "tool_execution_update", toolCallId: "b", chunk: 1 },
  ]);
});

test("flushes buffered tool updates before the next event", () => {
  const dispatched = [];
  const scheduler = manualScheduler();
  const coalescer = createMessageUpdateCoalescer((e) => dispatched.push(e), scheduler.schedule);

  coalescer.push({ type: "tool_execution_update", toolCallId: "a", chunk: 1 });
  coalescer.push({ type: "tool_execution_end", toolCallId: "a" });
  assert.deepEqual(dispatched.map((e) => e.type), ["tool_execution_update", "tool_execution_end"]);

  scheduler.fire();
  assert.equal(dispatched.length, 2);
});

test("message_end does not drop a buffered tool update", () => {
  const dispatched = [];
  const scheduler = manualScheduler();
  const coalescer = createMessageUpdateCoalescer((e) => dispatched.push(e), scheduler.schedule);

  coalescer.push({ type: "message_update", seq: 1 });
  coalescer.push({ type: "tool_execution_update", toolCallId: "a", chunk: 1 });
  coalescer.push({ type: "message_end", seq: 2 });
  assert.deepEqual(dispatched.map((e) => e.type), ["message_end"]);

  scheduler.fire();
  assert.deepEqual(dispatched.map((e) => e.type), ["message_end", "tool_execution_update"]);
});

test("a tool update without an id is dispatched immediately", () => {
  const dispatched = [];
  const scheduler = manualScheduler();
  const coalescer = createMessageUpdateCoalescer((e) => dispatched.push(e), scheduler.schedule);

  coalescer.push({ type: "tool_execution_update", chunk: 1 });
  assert.deepEqual(dispatched.map((e) => e.type), ["tool_execution_update"]);
});

test("reset drops buffered tool updates", () => {
  const dispatched = [];
  const scheduler = manualScheduler();
  const coalescer = createMessageUpdateCoalescer((e) => dispatched.push(e), scheduler.schedule);

  coalescer.push({ type: "tool_execution_update", toolCallId: "a", chunk: 1 });
  coalescer.reset();
  scheduler.fire();
  assert.equal(dispatched.length, 0);
});

test("explicit flush preserves queued message and tool output before snapshot hydration", () => {
  const dispatched = [];
  const scheduled = [];
  const coalescer = createMessageUpdateCoalescer((event) => dispatched.push(event), (flush) => {
    const job = { flush, cancelled: false };
    scheduled.push(job);
    return () => { job.cancelled = true; };
  });
  coalescer.push({ type: "message_update", text: "old" });
  coalescer.push({ type: "tool_execution_update", toolCallId: "a", text: "tool progress" });
  coalescer.push({ type: "message_update", text: "new" });
  coalescer.flush();
  assert.deepEqual(dispatched.map((event) => event.text), ["new", "tool progress"]);

  coalescer.push({ type: "message_update", text: "after snapshot" });
  const oldJob = scheduled.shift();
  if (!oldJob.cancelled) oldJob.flush();
  assert.deepEqual(dispatched.map((event) => event.text), ["new", "tool progress"]);
  const nextJob = scheduled.shift();
  if (!nextJob.cancelled) nextJob.flush();
  assert.deepEqual(dispatched.map((event) => event.text), ["new", "tool progress", "after snapshot"]);
});
