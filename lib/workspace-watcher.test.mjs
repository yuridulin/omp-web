import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";

const { watchWorkspace, isIgnoredWorkspacePath } = await import("./workspace-watcher.ts");

async function waitUntil(predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("timed out waiting for a workspace change");
}

test("ignored segments cover node_modules and .git", () => {
  assert.equal(isIgnoredWorkspacePath("node_modules/pkg/index.js"), true);
  assert.equal(isIgnoredWorkspacePath(".git/HEAD"), true);
  assert.equal(isIgnoredWorkspacePath("src/node_modules.ts"), false);
  assert.equal(isIgnoredWorkspacePath("src/index.ts"), false);
});

test("watchWorkspace reports real files and skips ignored trees", async () => {
  const root = mkdtempSync(join(tmpdir(), "omp-watch-"));
  const changes = [];
  const stop = watchWorkspace(root, (change) => changes.push(change));
  try {
    await new Promise((resolve) => setTimeout(resolve, 150));

    writeFileSync(join(root, "a.txt"), "a");
    await waitUntil(() => changes.some((change) => change.paths.includes("a.txt")));

    mkdirSync(join(root, "node_modules"));
    writeFileSync(join(root, "node_modules", "noise.js"), "x");
    writeFileSync(join(root, "b.txt"), "b");
    await waitUntil(() => changes.some((change) => change.paths.includes("b.txt")));

    const paths = changes.flatMap((change) => change.paths);
    assert.equal(paths.some((path) => path.startsWith("node_modules/")), false);
    assert.ok(changes.every((change) => change.root === root || change.root.toLowerCase() === root.toLowerCase()));
  } finally {
    stop();
    rmSync(root, { recursive: true, force: true });
  }
});
