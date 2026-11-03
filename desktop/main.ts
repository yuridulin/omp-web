import { join } from "node:path";
import Electrobun, { BrowserWindow, PATHS, Utils } from "electrobun/main";
import { startServer } from "../server/index.ts";

/**
 * Electrobun main process.
 *
 * The desktop app is the same server as `bun run app` with a native webview
 * instead of a browser: the server owns HTTP, SSE and the terminal WebSocket,
 * and the window simply points at its URL, so the client stays same-origin and
 * needs no knowledge of the desktop shell.
 *
 * Launch it with `bun run desktop:dev` / `bun run desktop:build`.
 */

/** `build.copy` places the SPA at `Resources/app/web`; see electrobun.config.ts. */
const staticRoot = join(PATHS.RESOURCES_FOLDER, "app", "web");

const stop = (server: { stop: (force?: boolean) => unknown }): void => {
  try {
    void server.stop(true);
  } catch {
    // Already stopped.
  }
};

try {
  const started = await startServer({ staticRoot });
  // Quitting (window closed, Cmd/Ctrl+Q) must release the port and child processes.
  Electrobun.events.on("before-quit", () => stop(started.server));
  process.on("exit", () => stop(started.server));

  const url = started.url.href.endsWith("/") ? started.url.href : `${started.url.href}/`;
  console.log(`omp-web desktop: ${url}`);

  new BrowserWindow({
    title: "omp-web",
    url,
    frame: { width: 1440, height: 900 },
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`omp-web desktop could not start: ${message}`);
  await Utils.showMessageBox({
    type: "error",
    title: "omp-web",
    message: "omp-web could not start",
    detail: `${message}\n\nIf port ${process.env.OMP_WEB_PORT ?? 6666} is busy, quit the other instance or set OMP_WEB_PORT.`,
  });
  Utils.quit(1);
}
