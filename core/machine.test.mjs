import assert from "node:assert/strict";
import { test } from "bun:test";

const { SessionMachine } = await import("./machine.ts");

/** Transport double: records frames, hands out queued replies, exposes handlers. */
function fakeTransport() {
  const sent = [];
  const opened = [];
  const replies = [];
  let handlers = null;
  let closes = 0;
  const transport = {
    open(sessionId, nextHandlers) {
      opened.push(sessionId);
      handlers = nextHandlers;
      return () => {
        closes += 1;
        handlers = null;
      };
    },
    send(sessionId, command) {
      sent.push({ sessionId, command });
      return Promise.resolve(replies.shift() ?? { ok: true, data: {} });
    },
    replies,
  };
  return {
    transport,
    replies,
    get sent() { return sent; },
    get opened() { return opened; },
    get closes() { return closes; },
    frame(next) { handlers.onFrame(next); },
    status(next, streamId) { handlers.onStatus(next, streamId); },
    get attached() { return handlers !== null; },
  };
}

function fakeStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    read(sessionId) { return store.get(sessionId) ?? null; },
    write(sessionId, value) { store.set(sessionId, value); },
    remove(sessionId) { store.delete(sessionId); },
  };
}

const clock = { now: () => 1000 };

test("open resets the model, restores the draft, and connects", () => {
  const fake = fakeTransport();
  const storage = fakeStorage({ "sess-1": JSON.stringify({ value: "half-written", images: [], files: [] }) });
  const machine = new SessionMachine({ transport: fake.transport, clock, storage });

  machine.open("sess-1");
  assert.equal(machine.state.sessionId, "sess-1");
  assert.equal(machine.state.connection, "connecting");
  assert.deepEqual(fake.opened, ["sess-1"]);
  assert.equal(machine.draft.value, "half-written");

  machine.open("sess-2");
  assert.equal(fake.closes, 1);
  assert.equal(machine.draft.value, "", "a session without a draft starts empty");
});

test("frames reach subscribers as one snapshot", () => {
  const fake = fakeTransport();
  const machine = new SessionMachine({ transport: fake.transport, clock });
  const seen = [];
  machine.subscribe((snapshot) => seen.push(snapshot));

  machine.open("sess-1");
  fake.status("open", "s1");
  fake.frame({ type: "agent_start", web: { streamId: "s1", sequence: 1 } });

  const last = seen.at(-1);
  assert.equal(last.session.connection, "open");
  assert.equal(last.session.run.status, "running");
  assert.equal(last.branching.editingEntryId, null);
  assert.equal(last.draft.value, "");
});

test("dispatch(prompt) sends one frame and keeps the optimistic bubble", async () => {
  const fake = fakeTransport();
  const machine = new SessionMachine({ transport: fake.transport, clock });
  machine.open("sess-1");

  const result = await machine.dispatch({ kind: "prompt", text: "fix the build" });
  assert.equal(result.ok, true);
  assert.deepEqual(fake.sent.at(-1), {
    sessionId: "sess-1",
    command: { type: "prompt", message: "fix the build" },
  });
  assert.equal(machine.state.optimistic?.content, "fix the build");

  machine.applyHistory([{ role: "user", content: "fix the build" }], ["e1"]);
  assert.equal(machine.state.optimistic, null);
});

test("a refused prompt is withdrawn and reported", async () => {
  const fake = fakeTransport();
  fake.replies.push({ ok: false, error: "runtime busy", code: "prompt_rejected" });
  const machine = new SessionMachine({ transport: fake.transport, clock });
  machine.open("sess-1");

  const result = await machine.dispatch({ kind: "prompt", text: "nope" });
  assert.equal(result.ok, false);
  assert.equal(machine.state.optimistic, null);
  assert.equal(machine.state.notices.at(-1).message, "runtime busy");
});

test("every command intent becomes one distinct frame", async () => {
  const fake = fakeTransport();
  const machine = new SessionMachine({ transport: fake.transport, clock });
  machine.open("sess-1");

  await machine.dispatch({ kind: "steer", text: "left" });
  await machine.dispatch({ kind: "follow-up", text: "later" });
  await machine.dispatch({ kind: "abort" });
  await machine.dispatch({ kind: "compact", instructions: "keep the API" });
  await machine.dispatch({ kind: "queue-remove", queue: "followUp", text: "later" });
  await machine.dispatch({ kind: "queue-promote", text: "later" });
  await machine.dispatch({ kind: "select-model", provider: "anthropic", modelId: "opus" });
  await machine.dispatch({ kind: "extension-response", requestId: "req-1", response: { ok: true } });

  assert.deepEqual(fake.sent.map((entry) => entry.command.type), [
    "steer",
    "follow_up",
    "abort",
    "compact",
    "remove_queued_message",
    "promote_queued_message",
    "set_model",
    "extension_ui_response",
  ]);
  assert.equal(fake.sent[0].command.streamingBehavior, "steer");
  assert.equal(fake.sent[6].command.provider, "anthropic");
  assert.equal(fake.sent[7].command.id, "req-1");
});

test("an edit is gated while a fork is in flight and vice versa", async () => {
  const fake = fakeTransport();
  const machine = new SessionMachine({ transport: fake.transport, clock });
  machine.open("sess-1");

  const pending = [];
  fake.transport.send = (sessionId, command) => {
    fake.sent.push({ sessionId, command });
    return new Promise((resolve) => pending.push(resolve));
  };

  const fork = machine.dispatch({ kind: "fork-entry", entryId: "e2", withEdits: false });
  assert.equal(machine.snapshot.branching.forkingEntryId, "e2");

  const blocked = await machine.dispatch({ kind: "edit-entry", entryId: "e3", text: "x" });
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /fork is already in flight/);
  assert.equal(fake.sent.filter((entry) => entry.command.type === "edit_message").length, 0);

  pending[0]({ ok: true, data: { newSessionId: "child-1" } });
  const forked = await fork;
  assert.equal(forked.data.newSessionId, "child-1");
  assert.equal(machine.snapshot.branching.forkingEntryId, null);

  const edit = machine.dispatch({ kind: "edit-entry", entryId: "e3", text: "rewrite" });
  assert.equal(machine.snapshot.branching.editingEntryId, "e3");
  const blockedFork = await machine.dispatch({ kind: "fork-entry", entryId: "e4", withEdits: true });
  assert.equal(blockedFork.ok, false);

  pending[1]({ ok: true, data: {} });
  await edit;
  assert.equal(machine.snapshot.branching.editingEntryId, null);
});

test("a refused history mutation does not leave the gate closed", async () => {
  const fake = fakeTransport();
  fake.replies.push({ ok: false, error: "cannot edit here" });
  const machine = new SessionMachine({ transport: fake.transport, clock });
  machine.open("sess-1");

  const result = await machine.dispatch({ kind: "edit-entry", entryId: "e1", text: "x" });
  assert.equal(result.ok, false);
  assert.equal(machine.snapshot.branching.editingEntryId, null);
  assert.equal(machine.state.notices.at(-1).message, "cannot edit here");
});

test("navigating a leaf re-reads that branch and records the selection", async () => {
  const fake = fakeTransport();
  const machine = new SessionMachine({ transport: fake.transport, clock });
  machine.open("sess-1");
  const before = machine.state.historyRevision;

  const result = await machine.dispatch({ kind: "navigate-leaf", leafId: "leaf-7" });
  assert.equal(result.ok, true);
  assert.equal(machine.state.view.leafId, "leaf-7");
  assert.equal(machine.snapshot.branching.leafId, "leaf-7");
  assert.ok(machine.state.historyRevision > before);
  assert.equal(fake.sent.length, 0, "a leaf change is local");
});

test("the pre-compaction window toggles without a frame", async () => {
  const fake = fakeTransport();
  const machine = new SessionMachine({ transport: fake.transport, clock });
  machine.open("sess-1");

  await machine.dispatch({ kind: "toggle-pre-compaction" });
  assert.equal(machine.state.view.includePreCompaction, true);
  await machine.dispatch({ kind: "toggle-pre-compaction" });
  assert.equal(machine.state.view.includePreCompaction, false);
  assert.equal(fake.sent.length, 0);
});

test("draft edits persist through the storage port and clearing removes them", async () => {
  const fake = fakeTransport();
  const storage = fakeStorage();
  const machine = new SessionMachine({ transport: fake.transport, clock, storage });
  machine.open("sess-1");

  await machine.dispatch({ kind: "draft-edit", patch: { text: "in progress" } });
  assert.equal(machine.draft.value, "in progress");
  assert.equal(JSON.parse(storage.store.get("sess-1")).value, "in progress");

  await machine.dispatch({ kind: "draft-edit", patch: { text: "in progress, v2" } });
  assert.equal(JSON.parse(storage.store.get("sess-1")).value, "in progress, v2");

  await machine.dispatch({ kind: "draft-clear" });
  assert.equal(machine.draft.value, "");
  assert.equal(storage.store.has("sess-1"), false, "an empty draft is removed, not stored blank");
});

test("commands before open are rejected", async () => {
  const fake = fakeTransport();
  const machine = new SessionMachine({ transport: fake.transport, clock });
  await assert.rejects(() => machine.dispatch({ kind: "abort" }), /open\(sessionId\)/);
  assert.equal(fake.sent.length, 0);
});

test("closing unsubscribes from the transport", () => {
  const fake = fakeTransport();
  const machine = new SessionMachine({ transport: fake.transport, clock });
  machine.open("sess-1");
  machine.close();
  assert.equal(fake.closes, 1);
  assert.equal(fake.attached, false);
  assert.equal(machine.state.connection, "closed");
});
