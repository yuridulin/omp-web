/**
 * URL policy for links the agent or an extension asks the host to open.
 *
 * Only http, https and mailto survive: a hostile or malformed URL must not be
 * able to smuggle `javascript:`, `data:`, `file:` or a protocol-relative
 * `//host` target into the browser.
 */

const SAFE_SCHEMES: Record<string, true> = { http: true, https: true, mailto: true };

/**
 * Validate a URL to open. Returns the trimmed URL when its scheme is allowed,
 * otherwise null.
 */
export function safeOpenUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const url = raw.trim();
  if (!url) return null;
  // Protocol-relative (//host/...) — ambiguous scheme, reject.
  if (url.startsWith("//")) return null;
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url);
  if (!match) return null;
  const scheme = match[1].toLowerCase();
  return SAFE_SCHEMES[scheme] ? url : null;
}
