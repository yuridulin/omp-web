import assert from "node:assert/strict";
import { test } from "bun:test";

const {
  clearLastOpenSession,
  getLastOpenSession,
  setLastOpenSession,
  workspaceKeyOf,
} = await import("./workspace-memory.ts");

function createStorage(values = {}) {
  const entries = new Map(Object.entries(values));
  return {
    getItem(key) { return entries.get(key) ?? null; },
    setItem(key, value) { entries.set(key, value); },
    removeItem(key) { entries.delete(key); },
    entries,
  };
}

test("remembers the last session for each project independently", () => {
  const storage = createStorage();
  setLastOpenSession("project-a", "session-a", storage);
  setLastOpenSession("project-b", "session-b", storage);

  assert.equal(getLastOpenSession("project-a", storage), "session-a");
  assert.equal(getLastOpenSession("project-b", storage), "session-b");
  clearLastOpenSession("project-a", storage);
  assert.equal(getLastOpenSession("project-a", storage), null);
  assert.equal(getLastOpenSession("project-b", storage), "session-b");
});

test("uses the shared project root so worktrees restore the same workspace", () => {
  assert.equal(workspaceKeyOf({ cwd: "D:/repo-worktrees/feature", projectRoot: "D:/repo" }), "D:/repo");
  assert.equal(workspaceKeyOf({ cwd: "D:/scratch" }), "D:/scratch");
});

test("does nothing when storage is omitted", () => {
  assert.equal(getLastOpenSession("project-a"), null);
  setLastOpenSession("project-a", "session-a");
  clearLastOpenSession("project-a");
  assert.equal(getLastOpenSession("project-a"), null);
});
