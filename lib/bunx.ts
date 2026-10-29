import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface RunBunxOptions {
  timeout?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface RunBunxResult {
  stdout: string;
  stderr: string;
}

/**
 * Cross-platform wrapper for invoking `bun x <args>` without ever using a
 * shell, so user-controlled arguments are never interpreted as shell syntax.
 */
export async function runBunx(args: string[], opts: RunBunxOptions = {}): Promise<RunBunxResult> {
  return execFileAsync(process.execPath, ["x", ...args], {
    timeout: opts.timeout,
    cwd: opts.cwd,
    env: opts.env,
  });
}
