import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { createJiti } from "jiti";
import { NextRequest } from "./http.ts";

/**
 * Minimal Node HTTP server for the omp API.
 *
 * The handlers under ./routes are the previous Next.js route handlers with
 * their two Next imports replaced by ./http.ts. This file supplies the missing
 * pieces only: filesystem routing with `[param]` and `[...catchAll]` segments,
 * a Web Request/Response bridge, and streaming (SSE) passthrough.
 */

interface Route {
  /** Path segments relative to the routes root, e.g. ["files", "[...path]"]. */
  segments: string[];
  file: string;
  /** Static segments first, then dynamic, catch-all last. */
  score: number;
}

const routesRoot = fileURLToPath(new URL("./routes", import.meta.url));
const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

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
    const score = segments.reduce((value, segment) => {
      if (segment.startsWith("[...")) return value - 1000;
      if (segment.startsWith("[")) return value - 10;
      return value + 1;
    }, 0);
    routes.push({ segments, file: full, score });
  }
  return routes.sort((a, b) => b.score - a.score);
}

function matchRoute(route: Route, segments: string[]): Record<string, string | string[]> | null {
  const params: Record<string, string | string[]> = {};
  let index = 0;
  for (let part = 0; part < route.segments.length; part++) {
    const pattern = route.segments[part];
    if (pattern.startsWith("[...")) {
      if (index >= segments.length) return null;
      params[pattern.slice(4, -1)] = segments.slice(index);
      index = segments.length;
      break;
    }
    if (index >= segments.length) return null;
    if (pattern.startsWith("[")) params[pattern.slice(1, -1)] = segments[index];
    else if (pattern !== segments[index]) return null;
    index += 1;
  }
  return index === segments.length ? params : null;
}

function requestHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  return headers;
}

async function dispatch(
  request: IncomingMessage,
  response: ServerResponse,
  routes: Route[],
): Promise<void> {
  const host = request.headers.host ?? "127.0.0.1";
  const url = new URL(request.url ?? "/", `http://${host}`);
  // The handlers were mounted under Next's app/api; keep the same URLs.
  const pathSegments = url.pathname.split("/").filter(Boolean).map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });
  if (pathSegments[0] === "api") pathSegments.shift();

  let module: Record<string, unknown> | null = null;
  let params: Record<string, string | string[]> | null = null;
  for (const route of routes) {
    const match = matchRoute(route, pathSegments);
    if (match) {
      module = await jiti.import(route.file) as Record<string, unknown>;
      params = match;
      break;
    }
  }

  if (!module) {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Not found", code: "not_found" }));
    return;
  }

  const method = (request.method ?? "GET").toUpperCase();
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
    const result = await handler(webRequest, { params: Promise.resolve(params ?? {}) });
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

function main(): void {
  const host = process.env.OMP_WEB_HOST || "127.0.0.1";
  const port = Number(process.env.OMP_WEB_PORT || process.env.PORT || 30178);
  const routes = collectRoutes();
  const server = createServer((request, response) => {
    void dispatch(request, response, routes);
  });
  server.listen(port, host, () => {
    console.log(`omp api listening on http://${host}:${port} (${routes.length} routes)`);
  });
}

main();
