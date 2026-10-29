import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { mkdtempSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, onTestFinished, spyOn, mock, jest, afterEach } from "bun:test";

// Bun captures named builtin imports at module load, so a spy placed after the
// subject import is invisible to it. Publish the patched module and re-import.
function publishBuiltinChildProcess() {
  const exported = { ...childProcess, default: childProcess };
  mock.module("child_process", () => exported);
  mock.module("node:child_process", () => exported);
}

let freshId = 0;
const freshImport = (path) => import(`${path}?fresh=${freshId++}`);

afterEach(() => {
  // Real timers first, then drop the spies and republish the real builtin: a
  // restored module mock is not reinstated by mock.restore() alone.
  jest.useRealTimers();
  jest.restoreAllMocks();
  publishBuiltinChildProcess();
});

async function setup(execute) {
  const dir = mkdtempSync(join(tmpdir(), "omp-version-"));
  const bin = join(dir, "omp");
  writeFileSync(bin, "omp/18.1.19\n");
  const previousBin = process.env.OMP_WEB_OMP_BIN;
  process.env.OMP_WEB_OMP_BIN = bin;
  onTestFinished(() => {
    if (previousBin === undefined) delete process.env.OMP_WEB_OMP_BIN;
    else process.env.OMP_WEB_OMP_BIN = previousBin;
    rmSync(dir, { recursive: true, force: true });
  });
  spyOn(childProcess, "execFile").mockImplementation((path, _args, _options, callback) => {
    if (execute) execute(callback);
    else callback(null, readFileSync(path, "utf8"));
  });
  publishBuiltinChildProcess();
  const { getOmpVersion } = await freshImport("./omp-cli.ts");
  // A fresh module per test keeps the process-wide version cache out of the way.
  return { dir, bin, getOmpVersion };
}

test("unchanged executables reuse the version without launching another process", async () => {
  let launches = 0;
  const { bin, getOmpVersion } = await setup((callback) => {
    launches++;
    callback(null, readFileSync(bin, "utf8"));
  });
  assert.equal(await getOmpVersion(), "omp/18.1.19");
  assert.equal(await getOmpVersion(), "omp/18.1.19");
  assert.equal(launches, 1);
  writeFileSync(bin, "omp/18.1.210\n");
  assert.equal(await getOmpVersion(), "omp/18.1.210");
  assert.equal(launches, 2);
});

test("atomic replacement invalidates even with the same size and modification time", async () => {
  const { dir, bin, getOmpVersion } = await setup();
  const original = statSync(bin);
  // Normalize both mtimes to the same precision before taking the cache snapshot.
  utimesSync(bin, original.atime, original.mtime);
  assert.equal(await getOmpVersion(), "omp/18.1.19");
  const replacement = join(dir, "replacement");
  writeFileSync(replacement, "omp/18.1.21\n");
  utimesSync(replacement, original.atime, original.mtime);
  assert.equal(statSync(replacement, { bigint: true }).mtimeNs, statSync(bin, { bigint: true }).mtimeNs);
  renameSync(replacement, bin);
  assert.equal(await getOmpVersion(), "omp/18.1.21");
});

test("retargeting the release directory invalidates the cached version", async () => {
  const { dir, bin, getOmpVersion } = await setup();
  const first = join(dir, "first");
  const second = join(dir, "second");
  mkdirSync(first);
  mkdirSync(second);
  renameSync(bin, join(first, "omp"));
  writeFileSync(join(second, "omp"), "omp/18.1.21\n");
  const current = join(dir, "current");
  symlinkSync(first, current, "junction");
  process.env.OMP_WEB_OMP_BIN = join(current, "omp");
  assert.equal(await getOmpVersion(), "omp/18.1.19");
  rmSync(current);
  symlinkSync(second, current, "junction");
  assert.equal(await getOmpVersion(), "omp/18.1.21");
});

test("unchanged launchers are re-probed after the five-minute safety expiry", async () => {
  let now = Date.now();
  spyOn(Date, "now").mockImplementation(() => now);
  let installedVersion = "omp/18.1.19\n";
  const { getOmpVersion } = await setup((callback) => callback(null, installedVersion));
  assert.equal(await getOmpVersion(), "omp/18.1.19");
  installedVersion = "omp/18.1.21\n";
  now += 5 * 60_000 - 1;
  assert.equal(await getOmpVersion(), "omp/18.1.19");
  now++;
  assert.equal(await getOmpVersion(), "omp/18.1.21");
});

test("overlapping version lookups share a result instead of racing failure backoff", async () => {
  const callbacks = [];
  const { bin, getOmpVersion } = await setup((callback) => callbacks.push(callback));
  const first = getOmpVersion();
  const second = getOmpVersion();
  if (callbacks.length > 1) {
    callbacks[1](null, "omp/18.1.19\n");
    await second;
    callbacks[0](new Error("executable replaced during update"), "");
  } else {
    callbacks[0](null, "omp/18.1.19\n");
  }
  assert.deepEqual(await Promise.all([first, second]), ["omp/18.1.19", "omp/18.1.19"]);
  writeFileSync(bin, "omp/18.1.210\n");
  const refreshed = getOmpVersion();
  callbacks.at(-1)(null, "omp/18.1.210\n");
  assert.equal(await refreshed, "omp/18.1.210");
});

test("an update during a probe does not cache its old result", async () => {
  const callbacks = [];
  const { bin, getOmpVersion } = await setup((callback) => callbacks.push(callback));
  const first = getOmpVersion();
  writeFileSync(bin, "omp/18.1.210\n");
  callbacks[0](null, "omp/18.1.19\n");
  assert.equal(await first, "omp/18.1.19");
  const refreshed = getOmpVersion();
  callbacks.at(-1)(null, "omp/18.1.210\n");
  assert.equal(await refreshed, "omp/18.1.210");
});

test("changed executables recover immediately from a failed-probe backoff", async () => {
  let fail = true;
  const { bin, getOmpVersion } = await setup((callback) => {
    callback(fail ? new Error("update in progress") : null, "omp/18.1.21\n");
  });
  assert.equal(await getOmpVersion(), null);
  fail = false;
  writeFileSync(bin, "updated executable\n");
  assert.equal(await getOmpVersion(), "omp/18.1.21");
});

test("removing an executable never serves its cached version", async () => {
  const { bin, getOmpVersion } = await setup();
  assert.equal(await getOmpVersion(), "omp/18.1.19");
  rmSync(bin);
  assert.equal(await getOmpVersion(), null);
});
