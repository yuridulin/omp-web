import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";

const {
  archiveSessions,
  loadSessionArchiveRegistry,
  parseSessionArchiveRegistry,
  restoreSession,
  saveSessionArchiveRegistry,
} = await import("./session-archive-registry.ts");

test("parses only well-formed entries and keeps the first duplicate", () => {
  assert.deepEqual(parseSessionArchiveRegistry("{not json"), { version: 1, sessions: [] });
  assert.deepEqual(parseSessionArchiveRegistry("[]"), { version: 1, sessions: [] });
  assert.deepEqual(parseSessionArchiveRegistry('{"version":1}'), { version: 1, sessions: [] });

  const parsed = parseSessionArchiveRegistry(JSON.stringify({
    version: 1,
    sessions: [
      { id: "a", archivedAt: "2026-01-02T03:04:05.000Z" },
      { id: "a", archivedAt: "2026-02-02T03:04:05.000Z" },
      { id: "  ", archivedAt: "2026-01-02T03:04:05.000Z" },
      { id: "b", archivedAt: "not a date" },
      "junk",
    ],
  }));
  assert.deepEqual(parsed.sessions, [
    { id: "a", archivedAt: "2026-01-02T03:04:05.000Z" },
    { id: "b", archivedAt: new Date(0).toISOString() },
  ]);
});

test("archiving is idempotent and restore removes the marker", () => {
  const empty = { version: 1, sessions: [] };
  const archived = archiveSessions(empty, ["a", "b"], "2026-01-02T00:00:00.000Z");
  assert.deepEqual(archived.sessions.map((entry) => entry.id), ["a", "b"]);

  // Re-archiving keeps the original timestamp and returns the same registry.
  assert.equal(archiveSessions(archived, ["a"], "2026-03-03T00:00:00.000Z"), archived);

  const restored = restoreSession(archived, "a");
  assert.deepEqual(restored.sessions.map((entry) => entry.id), ["b"]);
  assert.equal(restoreSession(restored, "missing"), restored);
});

test("persists the registry atomically under the agent dir", () => {
  const agentDir = mkdtempSync(join(tmpdir(), "omp-web-archive-registry-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    assert.deepEqual(loadSessionArchiveRegistry(), { version: 1, sessions: [] });
    saveSessionArchiveRegistry(archiveSessions({ version: 1, sessions: [] }, ["s1"]));
    assert.deepEqual(loadSessionArchiveRegistry().sessions.map((entry) => entry.id), ["s1"]);
    assert.match(readFileSync(join(agentDir, "archived-sessions.json"), "utf8"), /"s1"/);
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    rmSync(agentDir, { recursive: true, force: true });
  }
});

test("a corrupt registry file falls back to empty instead of throwing", () => {
  const agentDir = mkdtempSync(join(tmpdir(), "omp-web-archive-registry-bad-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    writeFileSync(join(agentDir, "archived-sessions.json"), "{broken");
    assert.deepEqual(loadSessionArchiveRegistry(), { version: 1, sessions: [] });
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    rmSync(agentDir, { recursive: true, force: true });
  }
});
