import type { WireEvent } from "./protocol";

/**
 * The world outside the state machine.
 *
 * The core never imports fetch, WebSocket, storage or timers; a host supplies
 * these ports. Tests supply fakes, which is why the machine is testable with no
 * DOM and no server.
 */

export type SendResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

export interface TransportHandlers {
  onFrame(frame: WireEvent): void;
  onStatus(status: "connecting" | "open" | "closed", streamId?: string | null): void;
}

export interface Transport {
  /** Subscribe to one session's live frames; returns the unsubscribe function. */
  open(sessionId: string, handlers: TransportHandlers): () => void;
  /** Send one command frame and await its acknowledgement. */
  send(sessionId: string, command: AgentCommand): Promise<SendResult>;
}

export interface AgentCommand {
  type: string;
  [key: string]: unknown;
}

/** Raw draft persistence; the core parses and serializes, the host stores. */
export interface DraftStorage {
  read(sessionId: string): unknown;
  write(sessionId: string, value: string): void;
  remove(sessionId: string): void;
}

export interface Clock {
  now(): number;
}

export const systemClock: Clock = {
  now: () => Date.now(),
};
