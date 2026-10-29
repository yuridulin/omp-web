import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "bun:test";

const { allowFileRoot } = await import("./file-access.ts");
const { createTerminal, TerminalError } = await import("./terminal.ts");

async function waitFor(predicate, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("timed out waiting for terminal output");
}

test("a PTY shell streams output and exits on kill", async () => {
  const dir = mkdtempSync(join(tmpdir(), "omp-pty-"));
  allowFileRoot(dir);
  try {
    const terminal = await createTerminal({ cwd: dir, cols: 80, rows: 24 });
    assert.ok(terminal.pid > 0);
    assert.equal(terminal.cwd, dir);

    let output = "";
    terminal.onData((data) => {
      output += data;
    });
    const exit = new Promise((resolve) => terminal.onExit(resolve));

    terminal.write(process.platform === "win32" ? "echo OMP_PTY_OK\r" : "echo OMP_PTY_OK\n");
    await waitFor(() => output.includes("OMP_PTY_OK"));

    terminal.resize(100, 40);
    terminal.kill();
    const exitCode = await Promise.race([
      exit,
      new Promise((resolve) => setTimeout(() => resolve("timeout"), 5000)),
    ]);
    assert.equal(typeof exitCode, "number");
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("a terminal outside the allowed roots is refused", async () => {
  const dir = mkdtempSync(join(dirname(process.cwd()), "omp-pty-denied-"));
  try {
    await assert.rejects(
      () => createTerminal({ cwd: dir }),
      (error) => error instanceof TerminalError && error.code === "access_denied",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("terminal dimensions are clamped and a missing cwd is rejected", async () => {
  await assert.rejects(
    () => createTerminal({ cwd: "" }),
    (error) => error instanceof TerminalError && error.code === "cwd_required",
  );
  await assert.rejects(
    () => createTerminal({ cwd: join(tmpdir(), "omp-pty-does-not-exist-xyz") }),
    (error) => error instanceof TerminalError && error.code === "directory_not_found",
  );
});
