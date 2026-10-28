import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { SessionMachine } = await jiti.import("./machine");

/** Transport double: records commands, lets a test push frames and status. */
function fakeTransport() {
  const sent = [];
  const opened = [];
  let handlers = null;
  let opens = 0;
  let closes = 0;
  const transport = {
    open(sessionId, nextHandlers) {
      opens += 1;
      opened.push(sessionId);
      handlers = nextHandlers;
      return () => {
        closes += 1;
        handlers = null;
      };
    },
    async send(sessionId, command) {
      sent.push({ sessionId, command });
      const next = transport.replies.shift();
      return next ?? { ok: true, data: {} };
    },
    replies: [],
  };
  return {
    transport,
    get sent() { return sent; },
    get openCount() { return opens; },
    get openedWith() { return opened; },
    get closeCount() { return closes; },
    frame(next) { handlers.onFrame(next); },
    status(next, streamId) { handlers.onStatus(next, streamId); },
    get attached() { return handlers !== null; },
  };
}

const clock = { now: () => 1000 };

test("open resets the model, connects, and closes the previous subscription", () => {
  const fake = fakeTransport();
  const machine = new SessionMachine({ transport: fake.transport, clock });

  machine.open("sess-1");
  assert.equal(machine.state.sessionId, "sess-1");
  assert.equal(machine.state.connection, "connecting");
  assert.equal(fake.openCount, 1);
  assert.deepEqual(fake.openedWith, ["sess-1"]);

  machine.open("sess-2");
  assert.equal(fake.closeCount, 1);
  assert.equal(fake.openCount, 2);
  assert.equal(machine.state.sessionId, "sess-2");
  assert.deepEqual(machine.state.messages, []);
});

test("frames reach subscribers through the pure reducer", () => {
  const fake = fakeTransport();
  const machine = new SessionMachine({ transport: fake.transport, clock });
  const seen = [];
  machine.subscribe((state) => seen.push(state));

  machine.open("sess-1");
  fake.status("open", "s1");
  fake.frame({ type: "agent_start", web: { streamId: "s1", sequence: 1 } });

  assert.equal(machine.state.connection, "open");
  assert.equal(machine.state.run.status, "running");
  assert.ok(seen.length >= 3, "each applied transition notifies subscribers");
});

test("a prompt shows an optimistic bubble and keeps it when accepted", async () => {
  const fake = fakeTransport();
  const machine = new SessionMachine({ transport: fake.transport, clock });
  machine.open("sess-1");

  const accepted = await machine.prompt("fix the build");
  assert.equal(accepted, true);
  assert.equal(fake.sent.length, 1);
  assert.deepEqual(fake.sent[0], { sessionId: "sess-1", command: { type: "prompt", message: "fix the build" } });
  assert.equal(machine.state.optimistic?.content, "fix the build");

  machine.applyHistory([{ role: "user", content: "fix the build" }], ["e1"]);
  assert.equal(machine.state.optimistic, null, "history echo retires the optimistic bubble");
});

test("a refused prompt is withdrawn and reported", async () => {
  const fake = fakeTransport();
  fake.transport.replies.push({ ok: false, error: "runtime busy", code: "prompt_rejected" });
  const machine = new SessionMachine({ transport: fake.transport, clock });
  machine.open("sess-1");

  const accepted = await machine.prompt("nope");
  assert.equal(accepted, false);
  assert.equal(machine.state.optimistic, null);
  assert.equal(machine.state.lastError, "runtime busy");
  assert.equal(machine.state.notices.at(-1).message, "runtime busy");
});

test("abort, steer, and queue removal use distinct frames", async () => {
  const fake = fakeTransport();
  const machine = new SessionMachine({ transport: fake.transport, clock });
  machine.open("sess-1");

  await machine.abort();
  await machine.steer("go left");
  await machine.removeQueued("followUp", "later");

  assert.deepEqual(fake.sent.map((entry) => entry.command.type), ["abort", "steer", "remove_queued_message"]);
  assert.equal(fake.sent[1].command.streamingBehavior, "steer");
  assert.equal(fake.sent[2].command.queue, "followUp");
  assert.equal(fake.sent[2].command.message, "later");
});

test("a refused command becomes a notice without touching the transcript", async () => {
  const fake = fakeTransport();
  fake.transport.replies.push({ ok: false, error: "nothing to abort" });
  const machine = new SessionMachine({ transport: fake.transport, clock });
  machine.open("sess-1");

  const ok = await machine.abort();
  assert.equal(ok, false);
  assert.equal(machine.state.notices.at(-1).message, "nothing to abort");
  assert.deepEqual(machine.state.messages, []);
});

test("commands before open are rejected", async () => {
  const fake = fakeTransport();
  const machine = new SessionMachine({ transport: fake.transport, clock });
  await assert.rejects(() => machine.prompt("hello"), /open\(sessionId\)/);
  assert.equal(fake.sent.length, 0);
});

test("subscription cancellation stops notifications", () => {
  const fake = fakeTransport();
  const machine = new SessionMachine({ transport: fake.transport, clock });
  const seen = [];
  const unsubscribe = machine.subscribe((state) => seen.push(state));
  machine.open("sess-1");
  const count = seen.length;
  unsubscribe();
  fake.status("open", "s1");
  assert.equal(seen.length, count);
});

test("closing unsubscribes from the transport and marks the session closed", () => {
  const fake = fakeTransport();
  const machine = new SessionMachine({ transport: fake.transport, clock });
  machine.open("sess-1");
  machine.close();
  assert.equal(fake.closeCount, 1);
  assert.equal(fake.attached, false);
  assert.equal(machine.state.connection, "closed");
});
