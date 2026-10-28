import { resolveSessionPath } from "./session-reader";

/** JSON body for an unknown session id. Callers respond with HTTP 404. */
export const SESSION_NOT_FOUND = { error: "Session not found", code: "session_not_found" } as const;

/** Resolve a session id to its file path, or the session-not-found body. */
export async function resolveSessionPathOr404(
  id: string,
): Promise<{ filePath: string } | { notFound: typeof SESSION_NOT_FOUND }> {
  const filePath = await resolveSessionPath(id);
  if (!filePath) return { notFound: SESSION_NOT_FOUND };
  return { filePath };
}

/** JSON body `{ error: string }` for an API failure. The caller sets the status. */
export function apiErrorBody(error: unknown): { error: string } {
  return { error: String(error) };
}
