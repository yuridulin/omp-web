/**
 * Starts the API server for the Playwright suite against an isolated agent dir
 * and a throwaway git workspace.
 *
 * Playwright's `webServer` waits for 127.0.0.1:30179 (the default API port is
 * deliberately not reused). Everything this script creates lives under
 * `web/e2e/.tmp`, which is gitignored and recreated on every run.
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const WEB_ROOT = path.resolve(HERE, "..");
const REPO_ROOT = path.resolve(WEB_ROOT, "..");
const TMP_DIR = path.join(HERE, ".tmp");
const AGENT_DIR = path.join(TMP_DIR, "agent");
const WORKSPACE = path.join(TMP_DIR, "workspace");
const BIN_DIR = path.join(TMP_DIR, "bin");
const FAKE_OMP = path.join(HERE, "fake-omp.ts");
const PORT = 30179;
const API_BASE = `http://127.0.0.1:${PORT}`;

function git(args: string[]): void {
  execFileSync("git", args, { cwd: WORKSPACE, stdio: "ignore", windowsHide: true });
}

function prepareWorkspace(): void {
  mkdirSync(path.join(WORKSPACE, "src"), { recursive: true });
  writeFileSync(
    path.join(WORKSPACE, "README.md"),
    "# E2E workspace\n\nDeterministic fixture workspace for omp-web Playwright tests.\n",
    "utf8",
  );
  writeFileSync(
    path.join(WORKSPACE, "src", "app.ts"),
    'export const app = "e2e";\n',
    "utf8",
  );
  git(["init", "-q"]);
  git(["config", "user.email", "e2e@example.test"]);
  git(["config", "user.name", "omp-web e2e"]);
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "Initial fixture commit"]);
}

/** Windows cannot exec a script directly; route the launcher through cmd.exe. */
function createOmpLauncher(): string {
  mkdirSync(BIN_DIR, { recursive: true });
  if (process.platform === "win32") {
    const launcher = path.join(BIN_DIR, "omp.cmd");
    writeFileSync(launcher, `@echo off\r\n"${process.execPath}" "${FAKE_OMP}" %*\r\n`, "utf8");
    return launcher;
  }
  chmodSync(FAKE_OMP, 0o755);
  return FAKE_OMP;
}

/** Persist the fixture paths so spec files (which run in a separate process) can import them. */
function writeEnvironmentFile(launcher: string): void {
  const envFile = path.join(TMP_DIR, "e2e-env.json");
  writeFileSync(
    envFile,
    `${JSON.stringify({
      workspace: WORKSPACE,
      agentDir: AGENT_DIR,
      apiBase: API_BASE,
      webBase: "http://127.0.0.1:5174",
      ompLauncher: launcher,
    }, null, 2)}\n`,
    "utf8",
  );
}

rmSync(TMP_DIR, { recursive: true, force: true });
mkdirSync(AGENT_DIR, { recursive: true });
prepareWorkspace();
const launcher = createOmpLauncher();
writeEnvironmentFile(launcher);

const child: ChildProcess = spawn(process.execPath, ["server/index.ts"], {
  cwd: REPO_ROOT,
  env: {
    ...process.env,
    OMP_WEB_HOST: "127.0.0.1",
    OMP_WEB_PORT: String(PORT),
    PI_CODING_AGENT_DIR: AGENT_DIR,
    OMP_WEB_OMP_BIN: launcher,
  },
  stdio: "inherit",
  windowsHide: true,
});

let stopping = false;
function forward(signal: NodeJS.Signals): void {
  if (stopping) return;
  stopping = true;
  if (child.exitCode === null && child.signalCode === null) {
    child.kill(signal);
    // Do not let a wedged Bun child keep Playwright's teardown waiting forever.
    const force = setTimeout(() => process.exit(0), 5_000);
    force.unref();
  } else {
    process.exit(0);
  }
}

process.on("SIGTERM", () => forward("SIGTERM"));
process.on("SIGINT", () => forward("SIGINT"));
process.on("exit", () => {
  if (child.exitCode === null && child.signalCode === null) child.kill();
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

process.stdout.write(`[e2e] workspace ${WORKSPACE}\n`);
