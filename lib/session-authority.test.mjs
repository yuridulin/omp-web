import assert from "node:assert/strict";
import { test } from "bun:test";

const { SessionAuthority } = await import("./session-authority.ts");

function createSession() {
  const listeners = new Set();
  const sent = [];
  let sequence = 0;
  return {
    sessionId: "s1",
    sessionFile: "",
    sent,
    isAlive: () => true,
    async send(command) {
      sent.push(command);
      return { accepted: true };
    },
    onFrame(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(event) {
      sequence += 1;
      for (const listener of listeners) {
        listener({ ...event, web: { streamId: "stream-1", sequence } });
      }
    },
    listenerCount: () => listeners.size,
  };
}

function createStorage() {
  const drafts = new Map();
  return {
    drafts,
    read: (sessionId) => drafts.get(sessionId) ?? null,
    write: (sessionId, value) => drafts.set(sessionId, value),
    remove: (sessionId) => drafts.delete(sessionId),
  };
}

const HISTORY = {
  messages: [{ role: "user", content: "hello", timestamp: 1 }],
  entryIds: ["e1"],
};

async function createAuthority(session, options = {}) {
  const storage = createStorage();
  const loads = [];
  const authority = new SessionAuthority(session, {
    clock: { now: () => 1000 },
    storage,
    loadHistory: async (_session, view) => {
      loads.push(view);
      return HISTORY;
    },
    ...options,
  });
  authority.start();
  await authority.refreshHistory();
  return { authority, storage, loads };
}

test("start loads the committed transcript into the core snapshot", async () => {
  const session = createSession();
  const { authority } = await createAuthority(session);

  assert.equal(authority.snapshot.session.sessionId, "s1");
  assert.equal(authority.snapshot.session.connection, "open");
  assert.deepEqual(authority.snapshot.session.messages, HISTORY.messages);
  assert.deepEqual(authority.snapshot.session.entryIds, HISTORY.entryIds);
  assert.equal(session.listenerCount(), 1, "the authority observes frames");

  authority.dispose();
  assert.equal(authority.snapshot.session.connection, "closed");
  assert.equal(session.listenerCount(), 0, "dispose detaches the frame observer");
});

test("dispatch sends the frame through the wrapper and updates the snapshot", async () => {
  const session = createSession();
  const { authority } = await createAuthority(session);

  const result = await authority.dispatch({ kind: "prompt", text: "hi" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { accepted: true });
  assert.deepEqual(session.sent[0], { type: "prompt", message: "hi" });
  assert.equal(authority.snapshot.session.optimistic.content, "hi");
  assert.equal(authority.snapshot.session.run.status, "idle");

  authority.dispose();
});

test("live frames update the snapshot and duplicate sequences are dropped", async () => {
  const session = createSession();
  const { authority } = await createAuthority(session);

  session.emit({
    type: "message_update",
    message: { role: "assistant", content: [{ type: "text", text: "partial" }] },
  });
  assert.equal(authority.snapshot.session.stream.message.content[0].text, "partial");
  assert.equal(authority.snapshot.session.sequence, 1);

  authority.dispose();
});

test("local intents change the view and re-read that branch", async () => {
  const session = createSession();
  const { authority, loads } = await createAuthority(session);
  const initialLoads = loads.length;

  await authority.dispatch({ kind: "navigate-leaf", leafId: "e1" });
  await authority.refreshHistory();

  assert.equal(authority.snapshot.session.view.leafId, "e1");
  assert.ok(loads.length > initialLoads, "the new view asks for its transcript");
  assert.equal(loads.at(-1).leafId, "e1");

  authority.dispose();
});

test("transport failures come back as a refused dispatch, not a throw", async () => {
  const session = createSession();
  session.send = async () => {
    throw new Error("omp is gone");
  };
  const { authority } = await createAuthority(session);

  const result = await authority.dispatch({ kind: "abort" });
  assert.deepEqual(result, { ok: false, reason: "omp is gone" });
  assert.equal(authority.snapshot.session.notices.at(-1).message, "omp is gone");

  authority.dispose();
});

test("draft edits persist through the storage adapter", async () => {
  const session = createSession();
  const { authority, storage } = await createAuthority(session);

  await authority.dispatch({ kind: "draft-edit", patch: { text: "typing" } });
  assert.equal(authority.snapshot.draft.value, "typing");
  assert.equal(JSON.parse(storage.drafts.get("s1")).value, "typing");

  await authority.dispatch({ kind: "draft-clear" });
  assert.equal(authority.snapshot.draft.value, "");
  assert.equal(storage.drafts.has("s1"), false);

  authority.dispose();
});
