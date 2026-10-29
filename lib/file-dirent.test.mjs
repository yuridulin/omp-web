import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, onTestFinished } from "bun:test";

/** Windows without Developer Mode or admin rights cannot create symlinks. */
function canCreateSymlink() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-symlink-probe-"));
  try {
    fs.writeFileSync(path.join(dir, "target"), "");
    fs.symlinkSync(path.join(dir, "target"), path.join(dir, "link"));
    return true;
  } catch (error) {
    if (error?.code === "EPERM") return false;
    throw error;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const symlinksAvailable = canCreateSymlink();

async function loadSubject() {
  return import("./file-dirent.ts");
}

test("uses Dirent types for regular files and directories", async () => {
  const { resolveDirentIsDirectory } = await loadSubject();
  const file = { isDirectory: () => false, isFile: () => true };
  const directory = { isDirectory: () => true, isFile: () => false };

  assert.equal(resolveDirentIsDirectory(file, "/unused/file"), false);
  assert.equal(resolveDirentIsDirectory(directory, "/unused/directory"), true);
});

test("falls back to stat when the Dirent type is unknown", async () => {
  const { resolveDirentIsDirectory } = await loadSubject();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "omp-web-dirent-"));
  onTestFinished(() => fs.rmSync(root, { recursive: true, force: true }));
  const directoryPath = path.join(root, "directory");
  fs.mkdirSync(directoryPath);

  const unknown = { isDirectory: () => false, isFile: () => false };
  assert.equal(resolveDirentIsDirectory(unknown, directoryPath), true);
});

test.skipIf(!symlinksAvailable)("follows directory symlinks and skips dangling symlinks", async () => {
  const { resolveDirentIsDirectory } = await loadSubject();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "omp-web-dirent-"));
  onTestFinished(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "target"));
  fs.symlinkSync("target", path.join(root, "directory-link"), "dir");
  fs.symlinkSync("missing", path.join(root, "dangling-link"), "file");

  const symlink = { isDirectory: () => false, isFile: () => false };
  assert.equal(
    resolveDirentIsDirectory(symlink, path.join(root, "directory-link")),
    true,
  );
  assert.equal(
    resolveDirentIsDirectory(symlink, path.join(root, "dangling-link")),
    null,
  );
});
