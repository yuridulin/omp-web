/** Canonical object guard for boundary data (HTTP/SSE payloads). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
