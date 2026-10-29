/** Shapes carried by the `session` SSE channel (`contract/events.md`). */

export interface ChatMessage {
  role: string;
  content: unknown;
  timestamp?: number;
  [key: string]: unknown;
}

export interface SessionState {
  sessionId: string | null;
  connection: "idle" | "connecting" | "open" | "reconnecting" | "closed" | string;
  streamId: string | null;
  sequence: number;
  run: { status: "idle" | "running"; error: string | null };
  messages?: ChatMessage[];
  entryIds?: string[];
  optimistic?: ChatMessage | null;
  stream: { active: boolean; message: ChatMessage | null; held: boolean };
  queue: { steering: string[]; followUp: string[] };
  notices: Array<{ id: string; type: string; message: string; at: number }>;
  toolResults?: Record<string, unknown>;
  historyRevision: number;
  lastError: string | null;
}

export interface DraftState {
  value: string;
  images: unknown[];
  files: unknown[];
}

export interface SessionSnapshot {
  session: SessionState;
  branching: unknown;
  draft: DraftState;
}

export interface SnapshotFrame {
  type: "snapshot";
  revision: number;
  history: boolean;
  snapshot: SessionSnapshot;
  [key: string]: unknown;
}

export interface ConnectedFrame {
  type: "connected";
  sessionId: string;
  web?: { streamId: string | null; sequence: number | null };
}

export interface ChannelFrame {
  type: string;
  [key: string]: unknown;
}
