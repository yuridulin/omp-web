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

test("a transient missing history file is retried instead of marked loaded", async () => {
  const session = createSession();
  let calls = 0;
  const { authority } = await createAuthority(session, {
    loadHistory: async () => {
      calls += 1;
      return calls === 1 ? null : HISTORY;
    },
  });

  assert.deepEqual(authority.snapshot.session.messages, []);
  await authority.refreshHistory();
  assert.deepEqual(authority.snapshot.session.messages, HISTORY.messages);

  authority.dispose();
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

// --- subagents -------------------------------------------------------------

const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");

function writeSubagentSession(dir) {
  const name = "2026-08-01T00-00-00_abc123";
  const sessionFile = join(dir, `${name}.jsonl`);
  writeFileSync(sessionFile, [
    JSON.stringify({ type: "session", version: 3, id: "s-sub", timestamp: "2026-08-01T00:00:00.000Z", cwd: "/work" }),
    JSON.stringify({
      type: "message",
      id: "e1",
      parentId: null,
      timestamp: "2026-08-01T00:00:01.000Z",
      message: {
        role: "toolResult",
        toolCallId: "tc1",
        toolName: "task",
        content: [],
        details: {
          progress: [{ index: 0, id: "Scout", agent: "scout", status: "completed", tokens: 1200, resolvedModel: "provider/gpt-x:high" }],
          results: [{ index: 0, id: "Scout", agent: "scout", exitCode: 0, tokens: 999 }],
        },
      },
    }),
  ].join("\n") + "\n");
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(join(dir, name, "Scout.jsonl"), [
    JSON.stringify({ type: "message", id: "s1", parentId: null, timestamp: "2026-08-01T00:00:02.000Z", message: { role: "user", content: "go" } }),
  ].join("\n") + "\n");
  return sessionFile;
}

test("the subagent roster seeds from disk without leaking absolute paths", async () => {
  const dir = mkdtempSync(join(tmpdir(), "omp-authority-subagents-"));
  const authority = new SessionAuthority(
    { ...createSession(), sessionId: "s-sub", sessionFile: writeSubagentSession(dir) },
    { loadHistory: async () => HISTORY },
  );
  try {
    const seen = [];
    const unsubscribe = authority.subscribeSubagents((snapshot) => seen.push(snapshot));
    await authority.seedSubagents();

    const snapshot = authority.subagents;
    assert.deepEqual(snapshot.roster.map((entry) => entry.id), ["Scout"]);
    assert.equal(snapshot.roster[0].status, "completed");
    assert.equal(snapshot.roster[0].transcriptAvailable, true);
    // The settled result wins over the earlier progress snapshot.
    assert.equal(snapshot.roster[0].progress.tokens, 999);
    assert.equal(snapshot.live, true);
    assert.ok(seen.length >= 1, "seeding notifies subscribers");
    assert.equal(JSON.stringify(snapshot).includes(dir), false, "the wire carries no absolute path");

    unsubscribe();
  } finally {
    authority.dispose();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("live frames fold into the roster, throttle progress, and flush a terminal status", async () => {
  const dir = mkdtempSync(join(tmpdir(), "omp-authority-live-"));
  const session = { ...createSession(), sessionFile: join(dir, "missing.jsonl") };
  const authority = new SessionAuthority(session, { loadHistory: async () => HISTORY });
  try {
    const snapshots = [];
    authority.subscribeSubagents((snapshot) => snapshots.push(snapshot));

    session.emit({
      type: "subagent_lifecycle",
      timestamp: 1000,
      payload: { id: "Scout", agent: "scout", status: "started", index: 0, parentToolCallId: "tc1" },
    });
    await new Promise((resolve) => setTimeout(resolve, 160));
    assert.equal(authority.subagents.roster[0].status, "started");
    assert.ok(snapshots.length >= 1, "a throttled snapshot still lands");

    session.emit({
      type: "subagent_progress",
      timestamp: 1100,
      payload: { parentToolCallId: "tc1", index: 0, progress: { id: "Scout", tokens: 4200, toolCount: 3, currentTool: "read" } },
    });
    await new Promise((resolve) => setTimeout(resolve, 160));
    assert.equal(authority.subagents.roster[0].progress.tokens, 4200);

    session.emit({ type: "subagent_event", timestamp: 1150, payload: { id: "Scout", event: { type: "tool_execution_start", toolName: "read", intent: "read a file" } } });
    await new Promise((resolve) => setTimeout(resolve, 160));
    assert.equal(authority.subagents.activity.Scout.length, 1);
    assert.match(authority.subagents.activity.Scout[0].label, /read — read a file/);

    const beforeCompletion = authority.subagents.revision;
    session.emit({ type: "subagent_lifecycle", timestamp: 1200, payload: { id: "Scout", status: "completed" } });
    assert.equal(authority.subagents.roster[0].status, "completed");
    assert.ok(authority.subagents.revision > beforeCompletion, "a terminal frame flushes immediately");
    assert.equal(snapshots.at(-1).roster[0].status, "completed");

    // A stale progress frame must not resurrect a finished agent.
    session.emit({ type: "subagent_progress", timestamp: 1300, payload: { progress: { id: "Scout", status: "running", tokens: 4300 } } });
    await new Promise((resolve) => setTimeout(resolve, 160));
    assert.equal(authority.subagents.roster[0].status, "completed");
    assert.equal(authority.subagents.roster[0].progress.tokens, 4300);
  } finally {
    authority.dispose();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("dispose detaches the subagent observer and timer", async () => {
  const dir = mkdtempSync(join(tmpdir(), "omp-authority-dispose-"));
  const session = { ...createSession(), sessionFile: join(dir, "missing.jsonl") };
  const authority = new SessionAuthority(session, { loadHistory: async () => HISTORY });
  const snapshots = [];
  authority.subscribeSubagents((snapshot) => snapshots.push(snapshot));
  authority.dispose();
  // start() was never called, so the only frame observer is the subagent one.
  assert.equal(session.listenerCount(), 0);
  const count = snapshots.length;
  session.emit({ type: "subagent_lifecycle", timestamp: 1000, payload: { id: "Late", status: "started" } });
  await new Promise((resolve) => setTimeout(resolve, 160));
  assert.equal(snapshots.length, count, "no notifications after dispose");
  rmSync(dir, { recursive: true, force: true });
});
