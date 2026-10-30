import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../server/index.ts";

/**
 * One-command launch: build the SPA when it is missing, start the Bun server
 * (API + static UI) and open the default browser on it.
 */

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const index = join(root, "web", "dist", "index.html");

if (!existsSync(index) || process.argv.includes("--build")) {
  console.log("Building the web console...");
  const build = Bun.spawnSync({
    cmd: [process.execPath, "run", "web:build"],
    cwd: root,
    stdio: ["inherit", "inherit", "inherit"],
  });
  if (build.exitCode !== 0) process.exit(build.exitCode ?? 1);
}

function openBrowser(url: string): void {
  try {
    if (process.platform === "win32") {
      Bun.spawn({ cmd: ["cmd", "/c", "start", "", url], stdio: ["ignore", "ignore", "ignore"] }).unref();
    } else if (process.platform === "darwin") {
      Bun.spawn({ cmd: ["open", url], stdio: ["ignore", "ignore", "ignore"] }).unref();
    } else {
      Bun.spawn({ cmd: ["xdg-open", url], stdio: ["ignore", "ignore", "ignore"] }).unref();
    }
  } catch {
    console.log(`Open ${url} in your browser.`);
  }
}

try {
  const { server, url } = await startServer();
  const href = url.href.endsWith("/") ? url.href : `${url.href}/`;
  console.log(`omp-web: ${href}`);
  if (process.env.OMP_WEB_OPEN !== "0") openBrowser(href);

  const stop = (): void => {
    void server.stop(true);
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error("If the port is busy, set OMP_WEB_PORT to another value.");
  process.exit(1);
}
