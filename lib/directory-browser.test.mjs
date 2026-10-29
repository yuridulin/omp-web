import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { test } from "bun:test";

/** Windows without Developer Mode or admin rights cannot create symlinks. */
function canCreateSymlink() {
  const dir = mkdtempSync(path.join(tmpdir(), "omp-symlink-probe-"));
  try {
    writeFileSync(path.join(dir, "target"), "");
    symlinkSync(path.join(dir, "target"), path.join(dir, "link"));
    return true;
  } catch (error) {
    if (error?.code === "EPERM") return false;
    throw error;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const symlinksAvailable = canCreateSymlink();

async function loadSubject() {
  return import("./directory-browser.ts");
}

test.skipIf(!symlinksAvailable)("lists directories and directory symlinks without returning files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omp-web-browse-"));
  try {
    await mkdir(path.join(root, "project"));
    await writeFile(path.join(root, "notes.txt"), "test", "utf8");
    await symlink(path.join(root, "project"), path.join(root, "linked-project"));

    const { listDirectories } = await loadSubject();
    const directories = await listDirectories(root);

    assert.deepEqual(directories.map((entry) => entry.name), ["linked-project", "project"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("expands home-relative paths and rejects missing directories", async () => {
  const { getBrowseStartDirectory, normalizeDirectory, resolveDirectory, shouldShowWindowsDrivePicker, getWindowsDriveCandidates } = await loadSubject();
  assert.equal(getBrowseStartDirectory(), homedir());
  assert.equal(getBrowseStartDirectory("/project"), "/project");
  assert.equal(shouldShowWindowsDrivePicker(undefined, "win32"), true);
  assert.equal(shouldShowWindowsDrivePicker(undefined, "darwin"), false);
  assert.equal(shouldShowWindowsDrivePicker("C:\\Projects", "win32"), false);
  assert.deepEqual(getWindowsDriveCandidates().at(0), { name: "A:", path: "A:\\" });
  assert.deepEqual(getWindowsDriveCandidates().at(-1), { name: "Z:", path: "Z:\\" });
  assert.equal(normalizeDirectory("~/project"), path.join(homedir(), "project"));
  await assert.rejects(resolveDirectory(path.join(tmpdir(), `omp-web-missing-${Date.now()}`)));
});

test("finds parent directories across POSIX and Windows paths", async () => {
  const { getParentDirectory } = await loadSubject();

  assert.equal(getParentDirectory("/Users/alex/project"), "/Users/alex");
  assert.equal(getParentDirectory("/"), null);
  assert.equal(getParentDirectory("C:\\Users\\Alex\\project"), "C:\\Users\\Alex");
  assert.equal(getParentDirectory("C:\\"), null);
});
