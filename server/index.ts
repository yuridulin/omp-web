import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { json } from "./http.ts";
import { isHttpMethod, readRouteContract } from "./contract.ts";
import { validateRequest } from "./request-contract.ts";
import { crossOriginRejection } from "./cross-origin.ts";
import { isRecord } from "../core/guards.ts";
import { createTerminal, TerminalError, type TerminalSession } from "../lib/terminal.ts";

/**
 * Minimal Bun.serve server for the omp API.
 *
 * The handlers under ./routes are the previous Next.js route handlers with
 * their two Next imports replaced by ./http.ts. This file supplies the missing
 * pieces only: filesystem routing with `[param]` and `[...catchAll]` segments
 * and the Request/Response passthrough (including streaming SSE responses).
 */

export interface Route {
  /** Path segments relative to the routes root, e.g. ["files", "[...path]"]. */
  segments: string[];
  file: string;
  /** From `routeScore`. Higher wins when several patterns match. */
  score: number;
}

const routesRoot = fileURLToPath(new URL("./routes", import.meta.url));

/** Static segment +1, `[param]` -10, `[...catchAll]` -1000. Higher wins. */
export function routeScore(segments: readonly string[]): number {
  return segments.reduce((value, segment) => {
    if (segment.startsWith("[...")) return value - 1000;
    if (segment.startsWith("[")) return value - 10;
    return value + 1;
  }, 0);
}

export function collectRoutes(dir = routesRoot): Route[] {
  const routes: Route[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      routes.push(...collectRoutes(full));
      continue;
    }
    if (entry.name !== "route.ts") continue;
    const segments = relative(routesRoot, dir).split(/[\\/]/).filter(Boolean);
    routes.push({ segments, file: full, score: routeScore(segments) });
  }
  return routes.sort((a, b) => b.score - a.score);
}

export function matchRoute(
  pattern: readonly string[],
  segments: readonly string[],
): Record<string, string | string[]> | null {
  const params: Record<string, string | string[]> = {};
  let index = 0;
  for (const token of pattern) {
    if (token.startsWith("[...")) {
      if (index >= segments.length) return null;
      params[token.slice(4, -1)] = segments.slice(index);
      index = segments.length;
      break;
    }
    if (index >= segments.length) return null;
    if (token.startsWith("[")) params[token.slice(1, -1)] = segments[index];
    else if (token !== segments[index]) return null;
    index += 1;
  }
  return index === segments.length ? params : null;
}

/** First pattern that matches after ranking by `routeScore` (higher wins). */
export function selectRoute<T extends { segments: readonly string[] }>(
  routes: readonly T[],
  segments: readonly string[],
): { route: T; params: Record<string, string | string[]> } | null {
  const ranked = [...routes].sort(
    (a, b) => routeScore(b.segments) - routeScore(a.segments),
  );
  for (const route of ranked) {
    const params = matchRoute(route.segments, segments);
    if (params) return { route, params };
  }
  return null;
}

const ROUTE_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;

/** Methods advertised in `Allow`; HEAD is implied by GET. */
function allowedMethods(module: Record<string, unknown>): string[] {
  const has = (name: string) => typeof module[name] === "function";
  return ROUTE_METHODS.filter((name) => has(name) || (name === "HEAD" && has("GET")));
}

export type RouteModuleLoader = (file: string) => Promise<Record<string, unknown>>;

/** Bun executes the route TypeScript and honors tsconfig paths, so a file URL
 * import is enough. */
function loadRouteModule(file: string): Promise<Record<string, unknown>> {
  return import(pathToFileURL(file).href) as Promise<Record<string, unknown>>;
}

export async function dispatch(
  request: Request,
  routes: readonly { segments: readonly string[]; file: string }[],
  loadModule: RouteModuleLoader = loadRouteModule,
): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const rejection = crossOriginRejection(method, request);
  if (rejection) {
    return new Response(JSON.stringify(rejection.body), {
      status: rejection.status,
      headers: { "content-type": rejection.contentType },
    });
  }
  // The handlers were mounted under Next's app/api; keep the same URLs.
  const pathSegments = url.pathname.split("/").filter(Boolean).map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });
  if (pathSegments[0] === "api") pathSegments.shift();

  const selected = selectRoute(routes, pathSegments);
  if (!selected) return json({ error: "Not found", code: "not_found" }, { status: 404 });

  const module = await loadModule(selected.route.file);
  const params = selected.params;

  // HEAD is GET without the body per RFC 9110; only a route's own HEAD
  // export overrides that.
  const handlerName = method === "HEAD" && typeof module.HEAD !== "function" ? "GET" : method;
  const handler = module[handlerName] as
    | ((request: Request, context: { params: Promise<Record<string, string | string[]>> }) => Promise<Response> | Response)
    | undefined;
  if (typeof handler !== "function") {
    return json({ error: "Method not allowed", code: "method_not_allowed" }, {
      status: 405,
      headers: { allow: allowedMethods(module).join(", ") },
    });
  }

  const contract = readRouteContract(module.contract);
  const operation = contract && isHttpMethod(handlerName) ? contract[handlerName] : undefined;
  if (operation) {
    const invalid = await validateRequest(operation, request, url);
    if (invalid) return invalid;
  }

  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers: new Headers(request.headers),
    signal: request.signal,
  };
  if (method !== "GET" && method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }
  const webRequest = new Request(url.href, init);

  try {
    const response = await handler(webRequest, { params: Promise.resolve(params) });
    if (method !== "HEAD") return response;
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : String(error),
      code: "internal_error",
    }, { status: 500 });
  }
}

/** Load every route module before listen. The loader caches the module, so the
 * first request does not pay the load cost. A failed module rejects and
 * main() does not listen. */
async function preloadRouteModules(routes: Route[]): Promise<void> {
  await Promise.all(routes.map((route) => loadRouteModule(route.file)));
}

export const TERMINAL_PATH = "/api/workspace/terminal";

interface TerminalSocketData {
  terminal: TerminalSession | null;
  creating: boolean;
}

function sendSocket(ws: Bun.ServerWebSocket<TerminalSocketData>, payload: unknown): void {
  try {
    ws.send(JSON.stringify(payload));
  } catch {
    // The socket closed between the terminal event and the send.
  }
}

function sendTerminalError(ws: Bun.ServerWebSocket<TerminalSocketData>, error: unknown): void {
  if (error instanceof TerminalError) {
    sendSocket(ws, { type: "error", error: error.message, code: error.code });
    return;
  }
  sendSocket(ws, {
    type: "error",
    error: error instanceof Error ? error.message : String(error),
    code: "terminal_failed",
  });
}

async function handleTerminalMessage(
  ws: Bun.ServerWebSocket<TerminalSocketData>,
  raw: string | Buffer,
): Promise<void> {
  let message: unknown;
  try {
    message = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf8"));
  } catch {
    sendSocket(ws, { type: "error", error: "Invalid terminal message", code: "invalid_message" });
    return;
  }
  if (!isRecord(message) || typeof message.type !== "string") {
    sendSocket(ws, { type: "error", error: "Invalid terminal message", code: "invalid_message" });
    return;
  }

  const data = ws.data;
  switch (message.type) {
    case "create": {
      if (data.terminal) {
        sendSocket(ws, { type: "error", error: "Terminal already created", code: "terminal_exists" });
        return;
      }
      if (data.creating) {
        sendSocket(ws, { type: "error", error: "Terminal is being created", code: "terminal_creating" });
        return;
      }
      data.creating = true;
      try {
        const terminal = await createTerminal({
          cwd: message.cwd,
          cols: message.cols,
          rows: message.rows,
        });
        data.terminal = terminal;
        terminal.onData((chunk) => sendSocket(ws, { type: "output", data: chunk }));
        terminal.onExit((exitCode) => {
          sendSocket(ws, { type: "exit", exitCode });
          try {
            ws.close(1000, "exit");
          } catch {
            // Already closing.
          }
        });
        sendSocket(ws, { type: "created", id: terminal.id, pid: terminal.pid, cwd: terminal.cwd });
      } catch (error) {
        sendTerminalError(ws, error);
        try {
          ws.close(1011, "create failed");
        } catch {
          // Already closing.
        }
      } finally {
        data.creating = false;
      }
      return;
    }
    case "input": {
      if (!data.terminal) {
        sendSocket(ws, { type: "error", error: "Terminal is not created", code: "terminal_missing" });
        return;
      }
      if (typeof message.data !== "string") {
        sendSocket(ws, { type: "error", error: "Invalid terminal message", code: "invalid_message" });
        return;
      }
      try {
        data.terminal.write(message.data);
      } catch (error) {
        sendTerminalError(ws, error);
      }
      return;
    }
    case "resize": {
      data.terminal?.resize(Number(message.cols), Number(message.rows));
      return;
    }
    case "close": {
      data.terminal?.kill();
      try {
        ws.close(1000, "closed");
      } catch {
        // Already closing.
      }
      return;
    }
    default:
      sendSocket(ws, { type: "error", error: "Unknown terminal message", code: "invalid_message" });
  }
}

/** Browsers must not open a cross-site WebSocket; non-browser clients omit Origin. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const host = process.env.OMP_WEB_HOST || "127.0.0.1";
  const port = Number(process.env.OMP_WEB_PORT || process.env.PORT || 30178);
  const routes = collectRoutes();
  try {
    await preloadRouteModules(routes);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
  try {
    const server = Bun.serve<TerminalSocketData>({
      hostname: host,
      port,
      // Bun closes idle streams after 10 s; /api/events heartbeats every 30 s.
      idleTimeout: 0,
      fetch: (request, server) => {
        if (new URL(request.url).pathname === TERMINAL_PATH) {
          if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
            return json(
              { error: "WebSocket upgrade required", code: "upgrade_required" },
              { status: 426 },
            );
          }
          if (!sameOrigin(request)) {
            return json(
              { error: "Cross-origin WebSocket rejected", code: "cross_origin" },
              { status: 403 },
            );
          }
          const upgraded = server.upgrade(request, {
            data: { terminal: null, creating: false },
          });
          return upgraded ? undefined : new Response("WebSocket upgrade failed", { status: 400 });
        }
        return dispatch(request, routes);
      },
      websocket: {
        maxPayloadLength: 1024 * 1024,
        idleTimeout: 0,
        message(ws, message) {
          void handleTerminalMessage(ws, message);
        },
        close(ws) {
          ws.data.terminal?.kill();
          ws.data.terminal = null;
        },
      },
      error(error) {
        console.error(error);
        return json({
          error: error instanceof Error ? error.message : String(error),
          code: "internal_error",
        }, { status: 500 });
      },
    });
    console.log(`omp api listening on ${server.url} (${routes.length} routes)`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

if (import.meta.main) void main();
