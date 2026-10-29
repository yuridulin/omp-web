import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NextRequest } from "./http.ts";
import { crossOriginRejection } from "./cross-origin.ts";

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

/** Server-generated JSON. The handlers' `Response.json` adds a charset. */
function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
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
  if (!selected) return json({ error: "Not found", code: "not_found" }, 404);

  const module = await loadModule(selected.route.file);
  const params = selected.params;

  const handler = module[method] as
    | ((request: Request, context: { params: Promise<Record<string, string | string[]>> }) => Promise<Response> | Response)
    | undefined;
  if (typeof handler !== "function") {
    return json({ error: "Method not allowed", code: "method_not_allowed" }, 405, {
      allow: Object.keys(module).join(", "),
    });
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
  const webRequest = new NextRequest(url.href, init);

  try {
    return await handler(webRequest, { params: Promise.resolve(params) });
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : String(error),
      code: "internal_error",
    }, 500);
  }
}

/** Load every route module before listen. The loader caches the module, so the
 * first request does not pay the load cost. A failed module rejects and
 * main() does not listen. */
async function preloadRouteModules(routes: Route[]): Promise<void> {
  await Promise.all(routes.map((route) => loadRouteModule(route.file)));
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
    const server = Bun.serve({
      hostname: host,
      port,
      // Bun closes idle streams after 10 s; /api/events heartbeats every 30 s.
      idleTimeout: 0,
      fetch: (request) => dispatch(request, routes),
      error(error) {
        console.error(error);
        return json({
          error: error instanceof Error ? error.message : String(error),
          code: "internal_error",
        }, 500);
      },
    });
    console.log(`omp api listening on ${server.url} (${routes.length} routes)`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

if (import.meta.main) void main();
