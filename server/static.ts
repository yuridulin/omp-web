import { statSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";

/**
 * Serves the built SPA from `web/dist`. The API lives under `/api`; everything
 * else is a file, or the SPA shell when the path looks like a client route.
 */

const IMMUTABLE = /(^|[\\/])assets[\\/]/;

export interface StaticTarget {
  file: string;
  /** Hashed Vite assets never change under the same name. */
  immutable: boolean;
}

function inside(root: string, file: string): boolean {
  const rel = relative(root, file);
  if (rel === "") return true;
  if (rel === ".." || rel.startsWith(`..${sep}`)) return false;
  return !isAbsolute(rel);
}

function regularFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Maps a URL pathname to a file under `root`, or null when the path escapes the
 * root, points at a missing asset, or the SPA shell is absent.
 */
export function resolveStaticTarget(root: string, pathname: string): StaticTarget | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (!decoded.startsWith("/") || decoded.includes("\0")) return null;

  const base = resolve(root);
  const candidate = resolve(base, `.${decoded}`);
  if (!inside(base, candidate)) return null;

  const immutable = IMMUTABLE.test(relative(base, candidate));

  try {
    const stats = statSync(candidate);
    if (stats.isFile()) return { file: candidate, immutable };
    if (stats.isDirectory() && regularFile(join(candidate, "index.html"))) {
      return { file: join(candidate, "index.html"), immutable };
    }
  } catch {
    // Missing paths fall through to the SPA shell.
  }

  // A missing hashed asset must 404, not return HTML with a JS content type.
  if (decoded.startsWith("/assets/")) return null;
  if (extname(decoded) !== "") return null;

  const index = join(base, "index.html");
  return regularFile(index) ? { file: index, immutable: false } : null;
}

/** Returns null for API paths and non-GET requests so the dispatcher handles them. */
export async function serveStatic(root: string, request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  const target = resolveStaticTarget(root, url.pathname);
  if (!target) return null;

  const file = Bun.file(target.file);
  const headers = new Headers({
    "content-type": file.type || "application/octet-stream",
    "cache-control": target.immutable ? "public, max-age=31536000, immutable" : "no-cache",
  });
  return new Response(request.method === "HEAD" ? null : file, { headers });
}
