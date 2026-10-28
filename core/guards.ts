/**
 * Canonical runtime guard for "a plain object".
 *
 * This is the one definition in the core: every boundary parser imports it
 * instead of re-deriving the check. It narrows to `Record<string, unknown>`;
 * fields stay `unknown` and are validated by the caller.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
