/**
 * Shared HTTP helpers for the API routes.
 *
 * The routes were previously Next.js handlers; these two functions are the
 * only pieces they still shared with that runtime.
 */

/** JSON response; adds `content-type` unless the caller set one. */
export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers as Bun.HeadersInit);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export type ReadJsonResult<T> =
  | { ok: true; body: T }
  | { ok: false; response: Response };

/**
 * Parses a request body at the boundary. Malformed JSON is a client error with
 * a stable code, not a handler crash reported as 500.
 */
export async function readJson<T = unknown>(request: Request): Promise<ReadJsonResult<T>> {
  try {
    return { ok: true, body: (await request.json()) as T };
  } catch {
    return {
      ok: false,
      response: json(
        { error: "Invalid JSON request body", code: "invalid_json" },
        { status: 400 },
      ),
    };
  }
}
