import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, jest, afterEach, beforeEach, afterAll, onTestFinished } from "bun:test";

beforeEach(() => {
  jest.useRealTimers();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});
afterAll(() => {
  jest.useRealTimers();
});


/** A new omp-web process: fresh tracker, same agent dir. */
function restart() {
  globalThis.__ompResumeTracker = undefined;
}

const { EXIT_GRACE_MS, markShuttingDown, recordRunningSessions, takeInterruptedSessions } = await import("./session-resume.ts");
const { saveWebServerSettings } = await import("./web-settings.ts");

/** Fresh agent dir and tracker per test; the resume setting starts as given. */
function setup({ enabled }) {
  const agentDir = mkdtempSync(join(tmpdir(), "omp-web-resume-test-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  globalThis.__ompResumeTracker = undefined;
  onTestFinished(() => {
    for (const timer of globalThis.__ompResumeTracker?.drops.values() ?? []) clearTimeout(timer);
    globalThis.__ompResumeTracker = undefined;
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    rmSync(agentDir, { recursive: true, force: true });
  });
  saveWebServerSettings({ autoResumeSessions: enabled });
  // Seeds use the pre-per-instance name; this instance writes its own pid's list.
  const listPath = join(agentDir, "omp-web-interrupted-sessions.json");
  const ownPath = join(agentDir, `omp-web-interrupted-sessions-${process.pid}.json`);
  const recorded = () => (existsSync(ownPath) ? JSON.parse(readFileSync(ownPath, "utf8")).sessions.map((s) => s.id) : []);
  return { agentDir, listPath, ownPath, recorded };
}

const A = { id: "01a0e6b0-d916-7610-8343-f4a766ba005a", advisor: false };
const B = { id: "01a0e6b0-d916-7610-8343-f4a766ba005b", advisor: true };

test("with the setting off nothing is recorded and a leftover list is discarded", () => {
  const { listPath, recorded } = setup({ enabled: false });
  writeFileSync(listPath, JSON.stringify({ sessions: [A] }));
  recordRunningSessions([B], () => true);
  assert.deepEqual(recorded(), []);
  assert.deepEqual(takeInterruptedSessions(), []);
});

test("a run that ends normally leaves the list; one still running stays", () => {
  const { recorded } = setup({ enabled: true });
  recordRunningSessions([A, B], () => true);
  assert.deepEqual(recorded(), [A.id, B.id]);
  recordRunningSessions([B], () => true);
  assert.deepEqual(recorded(), [B.id]);
  recordRunningSessions([], () => true);
  assert.deepEqual(recorded(), []);
});

test("a crashed child is dropped after the grace window while omp-web keeps running", () => {
  jest.useFakeTimers();
  const { recorded } = setup({ enabled: true });
  recordRunningSessions([A], () => true);
  recordRunningSessions([], () => false);
  assert.deepEqual(recorded(), [A.id], "kept until the grace window passes");
  jest.advanceTimersByTime(EXIT_GRACE_MS);
  assert.deepEqual(recorded(), []);
});

test("children dying just before the shutdown handler are still resumed", () => {
  jest.useFakeTimers();
  const { ownPath } = setup({ enabled: true });
  recordRunningSessions([A, B], () => true);
  recordRunningSessions([], () => false);
  markShuttingDown();
  recordRunningSessions([], () => false);
  jest.advanceTimersByTime(EXIT_GRACE_MS);
  restart();
  assert.deepEqual(takeInterruptedSessions(), [A, B]);
  assert.equal(existsSync(ownPath), false, "the list is consumed");
  assert.deepEqual(takeInterruptedSessions(), [], "handed out once");
});

test("a session started before resume runs does not overwrite the previous run's list", () => {
  const { listPath, recorded } = setup({ enabled: true });
  writeFileSync(listPath, JSON.stringify({ sessions: [A] }));
  recordRunningSessions([B], () => true);
  assert.deepEqual(recorded(), [B.id]);
  assert.deepEqual(takeInterruptedSessions(), [A]);
});

test("entries with an invalid session id are ignored", () => {
  const { listPath } = setup({ enabled: true });
  writeFileSync(listPath, JSON.stringify({ sessions: [{ id: "../../etc/passwd" }, { id: 7 }, A] }));
  restart();
  assert.deepEqual(takeInterruptedSessions(), [A]);
});

/** A running process standing in for another omp-web instance. */
function liveInstance() {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60_000)"], { stdio: "ignore" });
  onTestFinished(() => child.kill());
  return child.pid;
}

test("another live instance's list is neither resumed nor overwritten, and this one records its own", () => {
  const { agentDir, recorded } = setup({ enabled: true });
  const ownerPath = join(agentDir, `omp-web-interrupted-sessions-${liveInstance()}.json`);
  writeFileSync(ownerPath, JSON.stringify({ sessions: [A] }));
  restart();
  assert.deepEqual(takeInterruptedSessions(), []);
  recordRunningSessions([B], () => true);
  recordRunningSessions([], () => true);
  assert.deepEqual(JSON.parse(readFileSync(ownerPath, "utf8")).sessions, [A], "the owner's list stays intact");
  recordRunningSessions([B], () => true);
  assert.deepEqual(recorded(), [B.id]);
});

test("a list whose writer has exited is resumed", () => {
  const { agentDir } = setup({ enabled: true });
  const deadPath = join(agentDir, `omp-web-interrupted-sessions-${spawnSync(process.execPath, ["-e", "0"]).pid}.json`);
  writeFileSync(deadPath, JSON.stringify({ sessions: [A] }));
  restart();
  assert.deepEqual(takeInterruptedSessions(), [A]);
  assert.equal(existsSync(deadPath), false, "the list is consumed");
});

test("a list from before the last boot is resumed even if its pid is in use again", () => {
  const { agentDir } = setup({ enabled: true });
  const stalePath = join(agentDir, `omp-web-interrupted-sessions-${liveInstance()}.json`);
  writeFileSync(stalePath, JSON.stringify({ sessions: [A] }));
  utimesSync(stalePath, 0, 0);
  restart();
  assert.deepEqual(takeInterruptedSessions(), [A]);
});
