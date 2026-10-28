import { isApiRequestOriginAllowed, shouldCheckApiRequestOrigin } from "../lib/request-security.ts";

const BODY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const REJECTION = {
  status: 403,
  contentType: "application/json",
  body: {
    error: "Cross-origin API requests are not allowed",
    code: "cross_origin_forbidden",
  },
} as const;

export type CrossOriginRejection = typeof REJECTION;

/**
 * Browser cross-origin decision for methods that carry a body.
 * GET and HEAD are never rejected, so SSE and file reads stay open.
 * Returns null when the request may proceed.
 */
export function crossOriginRejection(method: string, request: Request): CrossOriginRejection | null {
  if (!BODY_METHODS.has(method.toUpperCase())) return null;
  if (!shouldCheckApiRequestOrigin(request) || isApiRequestOriginAllowed(request)) return null;
  return REJECTION;
}
