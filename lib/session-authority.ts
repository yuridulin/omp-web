import { SessionMachine, type DispatchResult, type Snapshot } from "../core/machine";
import type { ChatIntent } from "../core/commands";
import { parseDraft } from "../core/drafts";
import type { AgentMessage } from "../core/types";
import type { Clock, DraftStorage, Transport } from "../core/ports";
import { clearDraft, getDraft, setDraft } from "./draft-store";
import type { AgentEvent } from "./rpc-manager";
import {
  buildSessionContext,
  getSessionEntriesForDisplayAsync,
  resolveSessionPath,
} from "./session-reader";

/**
 * The server-side authority for one live session.
 *
 * The core `SessionMachine` owns the conversation state; this adapter supplies
 * the host pieces it cannot know: the omp wrapper as transport, the session
 * file as history, and the draft store. `AgentSessionWrapper` owns one
 * instance; routes render `snapshot` and send `dispatch` intents.
 */

/** The slice of `AgentSessionWrapper` the authority needs. */
export interface AuthoritySession {
  readonly sessionId: string;
  readonly sessionFile: string;
  isAlive(): boolean;
  send(command: Record<string, unknown>): Promise<unknown>;
  onFrame(listener: (event: AgentEvent) => void): () => void;
}

export interface SessionHistory {
  messages: AgentMessage[];
  entryIds: string[];
}

export interface SessionAuthorityOptions {
  clock?: Clock;
  storage?: DraftStorage;
  /** Override for tests; defaults to the session file behind the wrapper. */
  loadHistory?: (session: AuthoritySession, view: SessionView) => Promise<SessionHistory | null>;
}

/** The branch and compaction window a history read must project. */
export interface SessionView {
  leafId: string | null;
  includePreCompaction: boolean;
}

function draftStorage(): DraftStorage {
  return {
    read: (sessionId) => getDraft(sessionId),
    write: (sessionId, value) => {
      const draft = parseDraft(value);
      if (draft) {
        setDraft(sessionId, {
          value: draft.value,
          images: [...draft.images],
          files: [...draft.files],
        });
      }
    },
    remove: (sessionId) => clearDraft(sessionId),
  };
}

async function readSessionFile(
  session: AuthoritySession,
  view: SessionView,
): Promise<SessionHistory | null> {
  const filePath = session.sessionFile || (await resolveSessionPath(session.sessionId));
  if (!filePath) return null;
  const entries = await getSessionEntriesForDisplayAsync(filePath);
  // A null leaf means "newest entry", the branch the reader is on.
  const context = buildSessionContext(entries, view.leafId ?? undefined, {
    deferThinking: true,
    deferToolResultImages: true,
    includePreCompaction: view.includePreCompaction,
  });
  return { messages: context.messages, entryIds: context.entryIds };
}

export class SessionAuthority {
  readonly #session: AuthoritySession;
  readonly #machine: SessionMachine;
  readonly #loadHistory: (session: AuthoritySession, view: SessionView) => Promise<SessionHistory | null>;
  #loading: Promise<void> | null = null;
  #loadedRevision = -1;
  #disposed = false;

  constructor(session: AuthoritySession, options: SessionAuthorityOptions = {}) {
    this.#session = session;
    this.#loadHistory = options.loadHistory ?? readSessionFile;
    const transport: Transport = {
      open: (_sessionId, handlers) => {
        if (!this.#session.isAlive()) {
          handlers.onStatus("closed");
          return () => {};
        }
        const unsubscribe = this.#session.onFrame((event) => {
          // The wrapper cursor is a plain { streamId, sequence }; the core
          // wire type also allows extra cursor keys, so copy it explicitly.
          handlers.onFrame({
            ...event,
            web: { streamId: event.web.streamId, sequence: event.web.sequence },
          });
        });
        handlers.onStatus("open");
        return unsubscribe;
      },
      send: async (_sessionId, command) => {
        try {
          return { ok: true, data: await this.#session.send(command) };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const code = error !== null && typeof error === "object" && "code" in error && typeof error.code === "string"
            ? error.code
            : undefined;
          return { ok: false, error: message, ...(code === undefined ? {} : { code }) };
        }
      },
    };
    this.#machine = new SessionMachine({
      transport,
      ...(options.clock ? { clock: options.clock } : {}),
      storage: options.storage ?? draftStorage(),
    });
    this.#machine.subscribe((snapshot) => {
      if (snapshot.session.historyRevision !== this.#loadedRevision) void this.refreshHistory();
    });
  }

  get snapshot(): Snapshot {
    return this.#machine.snapshot;
  }

  subscribe(listener: (snapshot: Snapshot) => void): () => void {
    void this.refreshHistory();
    return this.#machine.subscribe(listener);
  }

  dispatch(intent: ChatIntent): Promise<DispatchResult> {
    return this.#machine.dispatch(intent);
  }

  start(): void {
    if (this.#disposed) return;
    this.#machine.open(this.#session.sessionId);
  }

  /** Follow the wrapper's identity without resetting the live conversation. */
  setSessionId(sessionId: string): void {
    this.#machine.setSessionId(sessionId);
  }

  /** Drop in-flight output; the host calls this when a run/command ends. */
  clearLive(): void {
    this.#machine.clearLive();
  }

  /** Start a new stream epoch after an identity change or child restart. */
  resetStream(streamId: string): void {
    this.#machine.resetStream(streamId);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#machine.close();
  }

  /** Re-read the committed transcript. Coalesces concurrent callers. */
  refreshHistory(): Promise<void> {
    if (this.#disposed) return Promise.resolve();
    if (!this.#loading) {
      this.#loading = this.#loadUntilCurrent().finally(() => {
        this.#loading = null;
      });
    }
    return this.#loading;
  }

  async #loadUntilCurrent(): Promise<void> {
    while (!this.#disposed) {
      const revision = this.#machine.state.historyRevision;
      if (revision === this.#loadedRevision) return;
      let history: SessionHistory | null = null;
      try {
        history = await this.#loadHistory(this.#session, this.#machine.state.view);
      } catch {
        // A too-large or unreadable file leaves the live frames as the only
        // source; the next revision retries.
        history = null;
      }
      if (this.#disposed) return;
      this.#loadedRevision = revision;
      if (history) this.#machine.applyHistory(history.messages, history.entryIds);
    }
  }
}

export type SnapshotFrameSnapshot = Omit<Snapshot, "session"> & {
  session: Omit<Snapshot["session"], "messages" | "entryIds">
    & Partial<Pick<Snapshot["session"], "messages" | "entryIds">>;
};

/**
 * Live snapshot frame. The transcript travels only when the history revision
 * changes; token updates carry the run/stream/queue state without re-sending
 * the committed messages.
 */
export interface SnapshotFrame {
  type: "snapshot";
  revision: number;
  history: boolean;
  snapshot: SnapshotFrameSnapshot;
}

export function snapshotFrame(snapshot: Snapshot, includeHistory: boolean): SnapshotFrame {
  if (includeHistory) {
    return {
      type: "snapshot",
      revision: snapshot.session.historyRevision,
      history: true,
      snapshot,
    };
  }
  const { messages: _messages, entryIds: _entryIds, ...session } = snapshot.session;
  return {
    type: "snapshot",
    revision: snapshot.session.historyRevision,
    history: false,
    snapshot: { ...snapshot, session },
  };
}
