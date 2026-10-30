import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * UI/UX development: the API under `--watch` and Vite with its `/api` proxy, in
 * one process. Ctrl+C stops both.
 */

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const inherit = ["inherit", "inherit", "inherit"] as const;

const api = Bun.spawn({
  cmd: [process.execPath, "--watch", "server/index.ts"],
  cwd: root,
  stdio: [...inherit],
});
const web = Bun.spawn({
  cmd: [process.execPath, "--cwd=web", "run", "dev"],
  cwd: root,
  stdio: [...inherit],
});

let stopping = false;
function stop(code = 0): void {
  if (stopping) return;
  stopping = true;
  api.kill();
  web.kill();
  process.exit(code);
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

const code = await Promise.race([api.exited, web.exited]);
stop(code);
