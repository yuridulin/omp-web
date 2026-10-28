/** Shared defensive type guards for untrusted/upstream JSON shapes.
 * Canonical definitions live in core; this module re-exports them so existing
 * lib imports keep working. */
export { asNumber, asString, isRecord } from "../core/guards";
