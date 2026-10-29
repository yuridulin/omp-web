import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";

const {
  writeWorkspaceFile,
  renameWorkspacePath,
  deleteWorkspacePath,
  FileMutationError,
  MAX_WORKSPACE_WRITE_BYTES,
} = await import("./file-mutations.ts");

function workspace() {
  return mkdtempSync(join(tmpdir(), "omp-files-"));
}

/** Windows without Developer Mode or admin rights cannot create symlinks. */
function canCreateSymlink() {
  const dir = mkdtempSync(join(tmpdir(), "omp-symlink-probe-"));
  try {
    writeFileSync(join(dir, "target"), "");
    symlinkSync(join(dir, "target"), join(dir, "link"));
    return true;
  } catch (error) {
    if (error?.code === "EPERM") return false;
    throw error;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const symlinksAvailable = canCreateSymlink();

/** Junctions need no privilege on Windows and still redirect a path. */
function canCreateJunction() {
  if (process.platform !== "win32") return false;
  const root = mkdtempSync(join(tmpdir(), "omp-junction-probe-"));
  const outside = mkdtempSync(join(tmpdir(), "omp-junction-out-"));
  try {
    const result = Bun.spawnSync(["cmd", "/c", "mklink", "/J", join(root, "link"), outside], {
      stdout: "ignore",
      stderr: "ignore",
    });
    return result.exitCode === 0;
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    rmSync(outside, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

const junctionsAvailable = canCreateJunction();

test("write creates parents, rename moves, delete removes", async () => {
  const root = workspace();
  try {
    const written = await writeWorkspaceFile(root, "src/deep/a.ts", "export const a = 1;\n");
    assert.equal(written.bytes, 20);
    assert.equal(readFileSync(join(root, "src/deep/a.ts"), "utf8"), "export const a = 1;\n");

    renameWorkspacePath(root, "src/deep/a.ts", "src/b.ts");
    assert.equal(existsSync(join(root, "src/deep/a.ts")), false);
    assert.equal(existsSync(join(root, "src/b.ts")), true);

    deleteWorkspacePath(root, "src/b.ts");
    assert.equal(existsSync(join(root, "src/b.ts")), false);
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("rename refuses to overwrite unless asked", async () => {
  const root = workspace();
  try {
    await writeWorkspaceFile(root, "a.txt", "a");
    await writeWorkspaceFile(root, "b.txt", "b");
    assert.throws(
      () => renameWorkspacePath(root, "a.txt", "b.txt"),
      (error) => error instanceof FileMutationError && error.code === "target_exists",
    );
    renameWorkspacePath(root, "a.txt", "b.txt", { overwrite: true });
    assert.equal(readFileSync(join(root, "b.txt"), "utf8"), "a");
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("paths escaping the workspace and absolute paths are rejected", async () => {
  const root = workspace();
  try {
    await assert.rejects(
      () => writeWorkspaceFile(root, "../outside.txt", "x"),
      (error) => error instanceof FileMutationError && error.code === "path_outside_workspace",
    );
    await assert.rejects(
      () => writeWorkspaceFile(root, join(root, "absolute.txt"), "x"),
      (error) => error instanceof FileMutationError && error.code === "invalid_path",
    );
    assert.throws(
      () => deleteWorkspacePath(root, "."),
      (error) => error instanceof FileMutationError && error.code === "invalid_path",
    );
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("oversized writes are refused before touching disk", async () => {
  const root = workspace();
  try {
    const huge = "x".repeat(MAX_WORKSPACE_WRITE_BYTES + 1);
    await assert.rejects(
      () => writeWorkspaceFile(root, "huge.txt", huge),
      (error) => error instanceof FileMutationError && error.code === "file_too_large",
    );
    assert.equal(existsSync(join(root, "huge.txt")), false);
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("a directory delete needs recursive=true", async () => {
  const root = workspace();
  try {
    await writeWorkspaceFile(root, "dir/a.txt", "a");
    assert.throws(
      () => deleteWorkspacePath(root, "dir"),
      (error) => error instanceof FileMutationError && error.code === "directory_not_empty",
    );
    deleteWorkspacePath(root, "dir", { recursive: true });
    assert.equal(existsSync(join(root, "dir")), false);
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test.skipIf(!symlinksAvailable)("a symlink inside the workspace cannot redirect writes outside", async () => {
  const root = workspace();
  const outside = mkdtempSync(join(tmpdir(), "omp-outside-"));
  try {
    mkdirSync(join(outside, "dir"));
    symlinkSync(join(outside, "dir"), join(root, "link"), "dir");
    await assert.rejects(
      () => writeWorkspaceFile(root, "link/escaped.txt", "x"),
      (error) => error instanceof FileMutationError && error.code === "path_outside_workspace",
    );
    assert.equal(existsSync(join(outside, "dir/escaped.txt")), false);
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    rmSync(outside, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test.skipIf(!symlinksAvailable)("direct writes to a symlink are refused", async () => {
  const root = workspace();
  const outside = mkdtempSync(join(tmpdir(), "omp-outside-file-"));
  try {
    writeFileSync(join(outside, "secret.txt"), "secret");
    symlinkSync(join(outside, "secret.txt"), join(root, "link.txt"), "file");
    await assert.rejects(
      () => writeWorkspaceFile(root, "link.txt", "overwritten"),
      (error) => error instanceof FileMutationError && error.code === "symlink_not_allowed",
    );
    assert.equal(readFileSync(join(outside, "secret.txt"), "utf8"), "secret");
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    rmSync(outside, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test.skipIf(!junctionsAvailable)("a junction cannot redirect writes outside or be written through", async () => {
  const root = workspace();
  const outside = mkdtempSync(join(tmpdir(), "omp-junction-outside-"));
  const inside = join(root, "real");
  mkdirSync(inside);
  const outsideLink = join(root, "outside-link");
  const insideLink = join(root, "inside-link");
  try {
    const created = Bun.spawnSync(["cmd", "/c", "mklink", "/J", outsideLink, outside], {
      stdout: "ignore",
      stderr: "ignore",
    });
    assert.equal(created.exitCode, 0);
    const createdInside = Bun.spawnSync(["cmd", "/c", "mklink", "/J", insideLink, inside], {
      stdout: "ignore",
      stderr: "ignore",
    });
    assert.equal(createdInside.exitCode, 0);

    await assert.rejects(
      () => writeWorkspaceFile(root, "outside-link/escaped.txt", "x"),
      (error) => error instanceof FileMutationError && error.code === "path_outside_workspace",
    );
    assert.equal(existsSync(join(outside, "escaped.txt")), false);

    await assert.rejects(
      () => writeWorkspaceFile(root, "inside-link", "x"),
      (error) => error instanceof FileMutationError && error.code === "symlink_not_allowed",
    );
  } finally {
    for (const link of [outsideLink, insideLink]) {
      try {
        rmSync(link, { recursive: false, force: true });
      } catch {
        // The junction may not have been created.
      }
    }
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    rmSync(outside, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
