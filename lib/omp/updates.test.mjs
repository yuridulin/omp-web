import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, onTestFinished, spyOn, mock, jest, afterEach } from "bun:test";

const { parseOmpUpdateStatus, createCachedOmpUpdateCheck, OMP_UPDATE_CHECK_TTL_MS } = await import("./updates.ts");

// Bun captures named builtin imports at module load, so a spy placed after the
// subject import is invisible to it. Publish the patched module and re-import.
function publishBuiltinChildProcess() {
  const exported = { ...childProcess, default: childProcess };
  mock.module("child_process", () => exported);
  mock.module("node:child_process", () => exported);
}

let freshId = 0;
const freshImport = (path) => import(`${path}?fresh=${freshId++}`);

/**
 * `updates.ts` keeps its `./omp-cli` dependency across fresh imports, and that
 * module caches the resolved binary for the process. Give every test its own.
 */
async function freshUpdates() {
  const ompCli = await freshImport("./omp-cli.ts");
  publishBuiltinChildProcess();
  mock.module("./omp-cli", () => ompCli);
  mock.module("./omp-cli.ts", () => ompCli);
  return freshImport("./updates.ts");
}

afterEach(() => {
  // Real timers first, then drop the spies and the published modules; the
  // clean child_process is republished for the next import.
  jest.useRealTimers();
  jest.restoreAllMocks();
  mock.restore();
  publishBuiltinChildProcess();
});
test("parses OMP update availability without assuming an update exists", () => {
  assert.deepEqual(parseOmpUpdateStatus("Current version: 17.2.11\nNew version available: 17.2.12"), {
    currentVersion: "17.2.11",
    availableVersion: "17.2.12",
    updateAvailable: true,
    updateCommand: "omp update",
  });
  assert.deepEqual(parseOmpUpdateStatus("Current version: 17.2.12\nOMP is up to date"), {
    currentVersion: "17.2.12",
    availableVersion: null,
    updateAvailable: false,
    updateCommand: "omp update",
  });
});

test("createCachedOmpUpdateCheck deduplicates concurrent calls and caches results within TTL", async () => {
  let runCalls = 0;
  let currentTime = 1_000_000;

  const fakeRun = async () => {
    runCalls += 1;
    await new Promise((resolve) => setImmediate(resolve));
    return "Current version: 17.2.11\nNew version available: 17.2.12";
  };

  const checker = createCachedOmpUpdateCheck(fakeRun, () => currentTime);

  // 1. Concurrent calls share one promise
  const [res1, res2, res3] = await Promise.all([checker(), checker(), checker()]);
  assert.equal(runCalls, 1, "Concurrent checks must only invoke run once");
  assert.equal(res1.availableVersion, "17.2.12");
  assert.equal(res2.availableVersion, "17.2.12");
  assert.equal(res3.availableVersion, "17.2.12");

  // 2. Cached within TTL
  currentTime += OMP_UPDATE_CHECK_TTL_MS - 1000;
  const resCached = await checker();
  assert.equal(runCalls, 1, "Must hit cache before TTL expiration");
  assert.equal(resCached.availableVersion, "17.2.12");

  // 3. TTL expiration causes new run
  currentTime += 2000;
  const resAfterTtl = await checker();
  assert.equal(runCalls, 2, "Must run check again after TTL expires");
  assert.equal(resAfterTtl.availableVersion, "17.2.12");

  // 4. Force bypasses completed cache
  const resForced = await checker(true);
  assert.equal(runCalls, 3, "force=true must bypass completed cache");
  assert.equal(resForced.availableVersion, "17.2.12");
});

test("createCachedOmpUpdateCheck reuses in-flight promise even when force is passed", async () => {
  let runCalls = 0;
  let resolveRun;
  const fakeRun = () => {
    runCalls += 1;
    return new Promise((resolve) => { resolveRun = resolve; });
  };

  const checker = createCachedOmpUpdateCheck(fakeRun);
  const firstPromise = checker(false);
  const secondPromise = checker(true); // force while first is still in flight

  assert.equal(runCalls, 1, "In-flight check must be reused even when force is true");
  resolveRun("Current version: 17.2.11\nOMP is up to date");
  const [res1, res2] = await Promise.all([firstPromise, secondPromise]);
  assert.equal(res1.updateAvailable, false);
  assert.equal(res2.updateAvailable, false);
});

test("createCachedOmpUpdateCheck does not cache failures and allows retry", async () => {
  let runCalls = 0;
  let shouldFail = true;
  const fakeRun = async () => {
    runCalls += 1;
    if (shouldFail) throw new Error("Network error");
    return "Current version: 17.2.11\nNew version available: 17.2.13";
  };

  const checker = createCachedOmpUpdateCheck(fakeRun);

  await assert.rejects(checker(), /Network error/);
  assert.equal(runCalls, 1);

  shouldFail = false;
  const resRetry = await checker();
  assert.equal(runCalls, 2, "Must retry after prior failure");
  assert.equal(resRetry.availableVersion, "17.2.13");
});

// ============================================================================
// win32 cmd-wrap coverage for runOmpUpdate (third spawn site — see D5)
// ============================================================================

function withPlatform(platform) {
  const original = process.platform;
  Object.defineProperty(process, "platform", { value: platform });
  onTestFinished(() => Object.defineProperty(process, "platform", { value: original }));
}

function withOmpBin(bin) {
  const previousBin = process.env.OMP_WEB_OMP_BIN;
  process.env.OMP_WEB_OMP_BIN = bin;
  onTestFinished(() => {
    if (previousBin === undefined) delete process.env.OMP_WEB_OMP_BIN;
    else process.env.OMP_WEB_OMP_BIN = previousBin;
  });
}

test("runOmpUpdate routes .cmd launchers through cmd.exe on win32", async () => {
  withPlatform("win32");
  const dir = mkdtempSync(join(tmpdir(), "omp-update-cmd-"));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, "omp-work.cmd");
  writeFileSync(bin, "stub\n");
  withOmpBin(bin);
  let captured = null;
  spyOn(childProcess, "execFile").mockImplementation((file, args, options, callback) => {
    captured = { file, args, options };
    queueMicrotask(() => callback(null, "Current version: 18.2.7\nOMP is up to date"));
  });
  const { runOmpUpdate } = await freshUpdates();
  const output = await runOmpUpdate(["--check"]);
  assert.match(output, /Current version: 18\.2\.7/);
  assert.equal(captured.file, "cmd.exe");
  assert.deepEqual(captured.args, ["/c", bin, "update", "--check"]);
  assert.equal(captured.options.windowsHide, true);
});

test("runOmpUpdate leaves .exe binaries untouched", async () => {
  const dir = mkdtempSync(join(tmpdir(), "omp-update-exe-"));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, "omp.exe");
  writeFileSync(bin, "stub\n");
  withOmpBin(bin);
  let captured = null;
  spyOn(childProcess, "execFile").mockImplementation((file, args, options, callback) => {
    captured = { file, args, options };
    queueMicrotask(() => callback(null, "Current version: 18.2.7\nOMP is up to date"));
  });
  const { runOmpUpdate } = await freshUpdates();
  await runOmpUpdate(["--check"]);
  assert.equal(captured.file, bin);
  assert.deepEqual(captured.args, ["update", "--check"]);
});

test("runOmpUpdate never wraps .cmd on non-win32 platforms", async () => {
  withPlatform("linux");
  const dir = mkdtempSync(join(tmpdir(), "omp-update-linux-"));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, "omp-work.cmd");
  writeFileSync(bin, "stub\n");
  withOmpBin(bin);
  let captured = null;
  spyOn(childProcess, "execFile").mockImplementation((file, args, options, callback) => {
    captured = { file, args, options };
    queueMicrotask(() => callback(null, "Current version: 18.2.7\nOMP is up to date"));
  });
  const { runOmpUpdate } = await freshUpdates();
  await runOmpUpdate(["--check"]);
  assert.equal(captured.file, bin);
  assert.deepEqual(captured.args, ["update", "--check"]);
});

test.skipIf(process.platform !== "win32")("real .cmd launcher through the real update path returns its stdout", async () => {
  const dir = mkdtempSync(join(tmpdir(), "omp-update-real-"));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, "fake-omp.cmd");
  writeFileSync(bin, [
    "@echo off",
    "echo Current version: 18.2.7",
    "echo OMP is up to date",
    "",
  ].join("\r\n"));
  withOmpBin(bin);
  const { runOmpUpdate, parseOmpUpdateStatus } = await freshUpdates();
  const output = await runOmpUpdate(["--check"]);
  assert.match(output, /OMP is up to date/);
  const status = parseOmpUpdateStatus(output);
  assert.equal(status.currentVersion, "18.2.7");
  assert.equal(status.updateAvailable, false);
}, 30_000);
