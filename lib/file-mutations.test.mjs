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

test("a symlink inside the workspace cannot redirect writes outside", async () => {
  const root = workspace();
  const outside = mkdtempSync(join(tmpdir(), "omp-outside-"));
  try {
    mkdirSync(join(outside, "dir"));
    let linked = true;
    try {
      symlinkSync(join(outside, "dir"), join(root, "link"), "dir");
    } catch {
      linked = false; // Windows without symlink privilege
    }
    if (!linked) return;
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

test("direct writes to a symlink are refused", async () => {
  const root = workspace();
  const outside = mkdtempSync(join(tmpdir(), "omp-outside-file-"));
  try {
    writeFileSync(join(outside, "secret.txt"), "secret");
    let linked = true;
    try {
      symlinkSync(join(outside, "secret.txt"), join(root, "link.txt"), "file");
    } catch {
      linked = false;
    }
    if (!linked) return;
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
