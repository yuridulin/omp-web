import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";

const {
  stageChanges,
  unstageChanges,
  commitChanges,
  listBranches,
  checkoutBranch,
  GitWriteError,
} = await import("./git-write.ts");

const hasGit = Boolean(Bun.which("git"));
const gitTest = hasGit ? test : test.skip;

function run(args, cwd) {
  const result = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
  return new TextDecoder().decode(result.stdout);
}

function createRepo() {
  const dir = mkdtempSync(join(tmpdir(), "omp-git-write-"));
  run(["init", "-q"], dir);
  run(["config", "user.email", "test@example.com"], dir);
  run(["config", "user.name", "Test"], dir);
  return dir;
}

function statusOf(status, path) {
  return status.files.find((file) => file.filePath === path || file.filePath.endsWith(`\\${path}`) || file.filePath.endsWith(`/${path}`));
}

gitTest("stage, commit, and unstage keep the index honest", async () => {
  const dir = createRepo();
  try {
    writeFileSync(join(dir, "a.txt"), "one\n");

    const staged = await stageChanges(dir, { paths: ["a.txt"] });
    assert.equal(statusOf(staged, "a.txt").indexStatus, "A");

    const committed = await commitChanges(dir, { message: "Add a" });
    assert.match(committed.commit, /^[0-9a-f]+$/);
    assert.equal(committed.status.files.length, 0);

    writeFileSync(join(dir, "a.txt"), "two\n");
    const restaged = await stageChanges(dir, { all: true });
    assert.equal(statusOf(restaged, "a.txt").indexStatus, "M");

    const unstaged = await unstageChanges(dir, { all: true });
    const entry = statusOf(unstaged, "a.txt");
    assert.equal(entry.indexStatus, " ");
    assert.equal(entry.worktreeStatus, "M");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

gitTest("branches list and checkout create the requested branch", async () => {
  const dir = createRepo();
  try {
    writeFileSync(join(dir, "a.txt"), "one\n");
    await stageChanges(dir, { all: true });
    await commitChanges(dir, { message: "Initial" });

    const initial = await listBranches(dir);
    assert.equal(initial.branches.length, 1);
    assert.equal(initial.current, initial.branches[0].name);

    await checkoutBranch(dir, { branch: "feature", create: true });
    const after = await listBranches(dir);
    assert.equal(after.current, "feature");
    assert.ok(after.branches.some((branch) => branch.name === "feature"));

    await checkoutBranch(dir, { branch: initial.current });
    assert.equal((await listBranches(dir)).current, initial.current);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

gitTest("invalid branch names, empty messages, and escaping paths are rejected", async () => {
  const dir = createRepo();
  try {
    writeFileSync(join(dir, "a.txt"), "one\n");
    await assert.rejects(
      () => checkoutBranch(dir, { branch: "bad name", create: true }),
      (error) => error instanceof GitWriteError && error.code === "invalid_branch_name",
    );
    await assert.rejects(
      () => commitChanges(dir, { message: "   " }),
      (error) => error instanceof GitWriteError && error.code === "commit_message_required",
    );
    await assert.rejects(
      () => stageChanges(dir, { paths: ["../outside.txt"] }),
      (error) => error instanceof GitWriteError && error.code === "path_outside_repository",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

gitTest("a directory without git reports not_a_git_repository", async () => {
  const dir = mkdtempSync(join(tmpdir(), "omp-no-git-"));
  try {
    await assert.rejects(
      () => listBranches(dir),
      (error) => error instanceof GitWriteError && error.code === "not_a_git_repository",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
