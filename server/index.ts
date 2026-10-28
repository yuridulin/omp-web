import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Readable } from "node:stream";
import { createJiti } from "jiti";
import { NextRequest } from "./http.ts";
import { crossOriginRejection } from "./cross-origin.ts";

/**
 * Minimal Node HTTP server for the omp API.
 *
 * The handlers under ./routes are the previous Next.js route handlers with
 * their two Next imports replaced by ./http.ts. This file supplies the missing
 * pieces only: filesystem routing with `[param]` and `[...catchAll]` segments,
 * a Web Request/Response bridge, and streaming (SSE) passthrough.
 */

export interface Route {
  /** Path segments relative to the routes root, e.g. ["files", "[...path]"]. */
  segments: string[];
  file: string;
  /** From `routeScore`. Higher wins when several patterns match. */
  score: number;
}

const routesRoot = fileURLToPath(new URL("./routes", import.meta.url));
const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

/** Static segment +1, `[param]` -10, `[...catchAll]` -1000. Higher wins. */
export function routeScore(segments: readonly string[]): number {
  return segments.reduce((value, segment) => {
    if (segment.startsWith("[...")) return value - 1000;
    if (segment.startsWith("[")) return value - 10;
    return value + 1;
  }, 0);
}

function collectRoutes(dir = routesRoot): Route[] {
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

function requestHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  return headers;
}

/** Header snapshot for the origin gate. The incoming body stream is not attached. */
function originGateRequest(url: URL, method: string, request: IncomingMessage): Request {
  const headers = new Headers();
  for (const name of ["host", "origin", "sec-fetch-site"]) {
    const value = request.headers[name];
    if (typeof value === "string") headers.set(name, value);
    else if (Array.isArray(value)) headers.set(name, value.join(", "));
  }
  return new Request(url, { method, headers });
}

export type RouteModuleLoader = (
  file: string,
) => Promise<Record<string, unknown>> | Record<string, unknown>;

function loadRouteModule(file: string): Promise<Record<string, unknown>> {
  return jiti.import<Record<string, unknown>>(file);
}

export async function dispatch(
  request: IncomingMessage,
  response: ServerResponse,
  routes: readonly { segments: readonly string[]; file: string }[],
  loadModule: RouteModuleLoader = loadRouteModule,
): Promise<void> {
  const host = request.headers.host ?? "127.0.0.1";
  const url = new URL(request.url ?? "/", `http://${host}`);
  const method = (request.method ?? "GET").toUpperCase();
  const rejection = crossOriginRejection(method, originGateRequest(url, method, request));
  if (rejection) {
    response.writeHead(rejection.status, { "content-type": rejection.contentType });
    response.end(JSON.stringify(rejection.body));
    return;
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
  if (!selected) {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Not found", code: "not_found" }));
    return;
  }

  const module = await loadModule(selected.route.file);
  const params = selected.params;

  const handler = module[method] as
    | ((request: Request, context: { params: Promise<Record<string, string | string[]>> }) => Promise<Response> | Response)
    | undefined;
  if (typeof handler !== "function") {
    response.writeHead(405, { "content-type": "application/json", allow: Object.keys(module).join(", ") });
    response.end(JSON.stringify({ error: "Method not allowed", code: "method_not_allowed" }));
    return;
  }

  const abort = new AbortController();
  request.on("close", () => abort.abort());

  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers: requestHeaders(request),
    signal: abort.signal,
  };
  if (method !== "GET" && method !== "HEAD") {
    init.body = Readable.toWeb(request) as unknown as ReadableStream<Uint8Array>;
    init.duplex = "half";
  }
  const webRequest = new NextRequest(url, init);

  try {
    const result = await handler(webRequest, { params: Promise.resolve(params) });
    response.statusCode = result.status;
    for (const [name, value] of result.headers) {
      if (name.toLowerCase() !== "set-cookie") response.setHeader(name, value);
    }
    const cookies = result.headers.getSetCookie?.() ?? [];
    if (cookies.length > 0) response.setHeader("set-cookie", cookies);
    if (!result.body) {
      response.end();
      return;
    }
    const body = Readable.fromWeb(result.body as Parameters<typeof Readable.fromWeb>[0]);
    body.on("error", () => response.destroy());
    body.pipe(response);
  } catch (error) {
    if (response.headersSent) {
      response.destroy();
      return;
    }
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      code: "internal_error",
    }));
  }
}

/** Compile every route module before listen. jiti caches the result, so the
 * first request does not pay the transform cost. A failed module rejects and
 * main() does not listen. */
async function preloadRouteModules(routes: Route[]): Promise<void> {
  await Promise.all(routes.map((route) => jiti.import(route.file)));
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
  const server = createServer((request, response) => {
    void dispatch(request, response, routes);
  });
  server.listen(port, host, () => {
    console.log(`omp api listening on http://${host}:${port} (${routes.length} routes)`);
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
