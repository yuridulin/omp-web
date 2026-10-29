import type { SessionAuthority } from "./session-authority";
import { getRpcSession } from "./rpc-manager";

/**
 * Looks up the authority owned by a live wrapper. Kept out of
 * `session-authority.ts` so the wrapper can own an authority without a module
 * cycle (the registry imports the wrapper registry, not the reverse).
 */
export function getSessionAuthority(sessionId: string): SessionAuthority | null {
  const wrapper = getRpcSession(sessionId);
  return wrapper?.isAlive() ? wrapper.authority : null;
}
