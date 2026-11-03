import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "bun:test";

// Point omp's data dir at a throwaway tree BEFORE any session scan runs, so the
// routes resolve this fixture instead of the developer's real sessions.
const agentDir = mkdtempSync(join(tmpdir(), "omp-subagent-routes-"));
const originalAgentDir = process.env.PI_CODING_AGENT_DIR;

const { collectRoutes, dispatch } = await import("./index.ts");
const { invalidateSessionListCache } = await import("../lib/session-reader.ts");

const routes = collectRoutes();

/**
 * The override is process-global, so it is installed only for the duration of
 * one test body and removed again: leaving it behind (or the session list
 * cache warm on a deleted directory) would poison every later test file.
 */
function withFixture(run) {
  process.env.PI_CODING_AGENT_DIR = agentDir;
  invalidateSessionListCache();
  writeSessionFixture();
  return run().finally(() => {
    if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
    invalidateSessionListCache();
    rmSync(agentDir, { recursive: true, force: true });
  });
}

const PROJECT_DIR = "--work--";
const SESSION_ID = "01a4c0ffee1234";
const SESSION_NAME = `2026-08-01T00-00-00.000Z_${SESSION_ID}`;
const SESSIONS_ROOT = join(agentDir, "sessions", PROJECT_DIR);
const sessionFile = join(SESSIONS_ROOT, `${SESSION_NAME}.jsonl`);
const artifactsDir = join(SESSIONS_ROOT, SESSION_NAME);

/** One parent session whose `task` toolResult recorded a finished subagent. */
function writeSessionFixture() {
  mkdirSync(SESSIONS_ROOT, { recursive: true });
  mkdirSync(artifactsDir, { recursive: true });
  writeFileSync(sessionFile, [
    JSON.stringify({ type: "session", version: 3, id: SESSION_ID, timestamp: "2026-08-01T00:00:00.000Z", cwd: "/work" }),
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
          progress: [{
            index: 0,
            id: "Scout",
            agent: "scout",
            status: "completed",
            task: "Map the surface",
            tokens: 1200,
            cost: 0.012,
            durationMs: 65000,
            resolvedModel: "provider/gpt-x:high",
          }],
          results: [{ index: 0, id: "Scout", agent: "scout", exitCode: 0, tokens: 999 }],
        },
      },
    }),
  ].join("\n") + "\n");

  writeFileSync(join(artifactsDir, "Scout.jsonl"), [
    JSON.stringify({
      type: "message",
      id: "s1",
      parentId: null,
      timestamp: "2026-08-01T00:00:02.000Z",
      message: { role: "user", content: "Map the surface" },
    }),
    JSON.stringify({
      type: "message",
      id: "s2",
      parentId: "s1",
      timestamp: "2026-08-01T00:00:03.000Z",
      message: { role: "assistant", content: "Found the surface." },
    }),
  ].join("\n") + "\n");
  writeFileSync(join(artifactsDir, "Scout.md"), "Found the surface.\n");
}

function request(path) {
  return new Request(`http://127.0.0.1:30178${path}`, { method: "GET" });
}

async function get(path) {
  invalidateSessionListCache();
  const response = await dispatch(request(path), routes);
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function post(path, body) {
  invalidateSessionListCache();
  const response = await dispatch(
    new Request(`http://127.0.0.1:30178${path}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    routes,
  );
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

/** First SSE frame of one subscription, or null when nothing arrives in time. */
async function firstFrame(stream, subscriptionId) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + 3000;
  try {
    while (Date.now() < deadline) {
      const chunk = await Promise.race([
        reader.read(),
        new Promise((resolve) => setTimeout(() => resolve({ done: true, value: undefined }), 500)),
      ]);
      if (chunk.done) continue;
      buffer += decoder.decode(chunk.value);
      const match = new RegExp(`event: ${subscriptionId}
data: (.*)

`).exec(buffer);
      if (match) return JSON.parse(match[1]);
    }
    return null;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

test("roster route returns the typed on-disk subagent list", () => withFixture(async () => {
    const { status, body } = await get(`/api/agent/sessions/${SESSION_ID}/subagents`);
    assert.equal(status, 200);
    assert.equal(body.subagents.length, 1);
    const [entry] = body.subagents;
    assert.equal(entry.id, "Scout");
    assert.equal(entry.agent, "scout");
    assert.equal(entry.status, "completed");
    assert.equal(entry.transcriptAvailable, true);
    // The settled result wins over the earlier progress snapshot.
    assert.equal(entry.tokens, 999);
}));

test("roster route 404s for an unknown session", () => withFixture(async () => {
    const { status, body } = await get("/api/agent/sessions/does-not-exist/subagents");
    assert.equal(status, 404);
    assert.equal(body.code, "session_not_found");
}));

test("transcript route pages, tails and rejects a malformed subagent id", () => withFixture(async () => {
    const first = await get(`/api/agent/sessions/${SESSION_ID}/subagents/Scout`);
    assert.equal(first.status, 200);
    assert.equal(first.body.messages.length, 2);
    assert.equal(first.body.messages[0].role, "user");

    const tail = await get(`/api/agent/sessions/${SESSION_ID}/subagents/Scout?mode=tail`);
    assert.equal(tail.status, 200);
    // Short transcript: the tail is the first page.
    assert.equal(tail.body.fromByte, 0);
    assert.deepEqual(tail.body.messages, first.body.messages);

    const invalid = await get(`/api/agent/sessions/${SESSION_ID}/subagents/${encodeURIComponent("../Scout")}`);
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.code, "invalid_subagent_id");

    const before = await get(`/api/agent/sessions/${SESSION_ID}/subagents/Scout?mode=before&beforeByte=999999`);
    assert.equal(before.status, 200);
    assert.equal(before.body.nextByte, before.body.totalBytes);
    assert.deepEqual(before.body.messages, first.body.messages);

    const head = await get(`/api/agent/sessions/${SESSION_ID}/subagents/Scout?mode=before&beforeByte=0`);
    assert.equal(head.status, 200);
    assert.deepEqual(head.body.messages, []);

    const missing = await get(`/api/agent/sessions/${SESSION_ID}/subagents/Ghost`);
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, "transcript_not_found");
}));

test("completion route returns the final artifact and 404s without one", () => withFixture(async () => {
    const ok = await get(`/api/agent/sessions/${SESSION_ID}/subagents/Scout?mode=completion`);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.completion, "Found the surface.\n");
    assert.equal(ok.body.truncated, false);

    const missing = await get(`/api/agent/sessions/${SESSION_ID}/subagents/Ghost?mode=completion`);
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, "transcript_not_found");
    assert.equal(existsSync(join(artifactsDir, "Ghost.md")), false);
}));

test("the events contract accepts a subagents subscription and serves the roster", async () => {
  writeSessionFixture();
  process.env.PI_CODING_AGENT_DIR = agentDir;
  invalidateSessionListCache();
  const { EventStreamConnection } = await import("../lib/event-stream-hub.ts");
  const connection = new EventStreamConnection();
  try {
    const subscribed = await post("/api/agent/events", {
      connectionId: connection.id,
      subscribe: { id: "s1", channel: { kind: "subagents", sessionId: SESSION_ID } },
    });
    // A contract that forgot the new channel kind answers 400 here and the
    // browser could never subscribe.
    assert.equal(subscribed.status, 200);
    assert.equal(subscribed.body.ok, true);

    const frame = await firstFrame(connection.stream, "s1");
    assert.equal(frame?.type, "subagents");
    assert.deepEqual(frame.roster.map((row) => row.id), ["Scout"]);
    assert.equal(frame.live, false);
  } finally {
    connection.close();
    if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
    invalidateSessionListCache();
    rmSync(agentDir, { recursive: true, force: true });
  }
});
