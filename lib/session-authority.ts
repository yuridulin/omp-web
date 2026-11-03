import { SessionMachine, type DispatchResult, type Snapshot } from "../core/machine";
import type { ChatIntent } from "../core/commands";
import { parseDraft } from "../core/drafts";
import {
  EMPTY_SUBAGENTS,
  mergeRoster,
  parseSubagentLifecycle,
  reduceSubagents,
  subagentWireInfo,
  type SubagentsSnapshot,
  type SubagentsState,
} from "../core/subagents";
import type { AgentMessage } from "../core/types";
import type { Clock, DraftStorage, Transport } from "../core/ports";
import { clearDraft, getDraft, setDraft } from "./draft-store";
import type { AgentEvent } from "./rpc-manager";
import { extractSubagentHistory } from "./subagent-history";
import { historyToRosterInfo } from "./subagent-types";
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

/** How often live subagent frames reach subscribers; a terminal frame bypasses
 * this so a finished agent never lingers as "working". */
const SUBAGENTS_NOTIFY_INTERVAL_MS = 100;

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
  #subagents: SubagentsState = EMPTY_SUBAGENTS;
  #subagentRevision = 0;
  #subagentListeners = new Set<(snapshot: SubagentsSnapshot) => void>();
  #subagentSeed: Promise<void> | null = null;
  #subagentSeeded = false;
  #subagentTimer: NodeJS.Timeout | null = null;
  #subagentNotifiedAt = 0;
  #detachSubagentFrames: (() => void) | null = null;

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
    // A replaced child may have written new task results the current roster
    // has not seen yet.
    void this.seedSubagents();
  }

  /** Drop in-flight output; the host calls this when a run/command ends. */
  clearLive(): void {
    this.#machine.clearLive();
  }

  /**
   * The session's subagent roster as clients see it: wire-projected (no paths)
   * and tagged with whether a live wrapper is feeding it.
   */
  get subagents(): SubagentsSnapshot {
    return {
      revision: this.#subagentRevision,
      live: this.#session.isAlive(),
      roster: this.#subagents.roster.map(subagentWireInfo),
      activity: this.#subagents.activity,
      transcriptVersions: this.#subagents.transcriptVersions,
    };
  }

  /**
   * Subscribe to the session's subagent roster.
   *
   * The on-disk roster is seeded on the first subscription, so a page reload (or
   * a session whose wrapper is already gone) still lists what happened. The
   * frame observer is installed once and kept until dispose: a later subscriber
   * must not depend on a seed alone, or agents that started while nobody was
   * watching would never appear.
   */
  subscribeSubagents(listener: (snapshot: SubagentsSnapshot) => void): () => void {
    this.#subagentListeners.add(listener);
    this.#observeSubagentFrames();
    void this.seedSubagents();
    return () => {
      this.#subagentListeners.delete(listener);
    };
  }

  /** Merge the on-disk roster in. Idempotent; safe to call repeatedly. */
  seedSubagents(): Promise<void> {
    if (this.#subagentSeed) return this.#subagentSeed;
    const seed = (async () => {
      const filePath = this.#session.sessionFile || (await resolveSessionPath(this.#session.sessionId));
      if (this.#disposed || !filePath) return;
      let history;
      try {
        history = extractSubagentHistory(filePath);
      } catch {
        // An unreadable parent file leaves the live roster as the only source.
        return;
      }
      if (this.#disposed) return;
      this.#subagentSeeded = true;
      if (history.length === 0) return;
      const roster = mergeRoster(this.#subagents.roster, history.map(historyToRosterInfo));
      this.#subagents = { ...this.#subagents, roster };
      this.#notifySubagents();
    })().catch(() => {}).finally(() => {
      if (this.#subagentSeed === seed) this.#subagentSeed = null;
    });
    this.#subagentSeed = seed;
    return seed;
  }

  #observeSubagentFrames(): void {
    if (this.#detachSubagentFrames || this.#disposed) return;
    this.#detachSubagentFrames = this.#session.onFrame((event) => this.#applySubagentFrame(event));
  }

  #applySubagentFrame(event: AgentEvent): void {
    if (this.#disposed) return;
    const type = event.type;
    if (type !== "subagent_lifecycle" && type !== "subagent_progress" && type !== "subagent_event") return;
    const now = typeof event.timestamp === "number" && Number.isFinite(event.timestamp)
      ? event.timestamp
      : Date.now();
    const next = reduceSubagents(this.#subagents, { type, payload: event.payload }, now);
    // A terminal lifecycle frame flushes immediately; throttled progress frames
    // would otherwise leave a finished agent displayed as working.
    const settled = type === "subagent_lifecycle"
      && parseSubagentLifecycle(event.payload, now)?.status !== "started";
    if (next !== this.#subagents) {
      this.#subagents = next;
      if (settled) this.#notifySubagents();
      else this.#notifySubagentsSoon();
    }
    // The roster fold needs the on-disk launch order (`batchSeq`); seeding here
    // keeps that ordering even when frames arrive before anyone subscribed.
    if (!this.#subagentSeeded) void this.seedSubagents();
  }

  #notifySubagentsSoon(): void {
    if (this.#subagentTimer) return;
    const wait = Math.max(0, SUBAGENTS_NOTIFY_INTERVAL_MS - (Date.now() - this.#subagentNotifiedAt));
    this.#subagentTimer = setTimeout(() => {
      this.#subagentTimer = null;
      this.#notifySubagents();
    }, wait);
    // A UI throttle must never hold the process open.
    this.#subagentTimer.unref?.();
  }

  #notifySubagents(): void {
    if (this.#disposed) return;
    if (this.#subagentTimer) {
      clearTimeout(this.#subagentTimer);
      this.#subagentTimer = null;
    }
    this.#subagentNotifiedAt = Date.now();
    this.#subagentRevision += 1;
    const snapshot = this.subagents;
    for (const listener of this.#subagentListeners) {
      // One broken subscriber must not stop the others (or the wrapper).
      try {
        listener(snapshot);
      } catch { /* ignore */ }
    }
  }

  /** Start a new stream epoch after an identity change or child restart. */
  resetStream(streamId: string): void {
    this.#machine.resetStream(streamId);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#subagentTimer) {
      clearTimeout(this.#subagentTimer);
      this.#subagentTimer = null;
    }
    this.#subagentListeners.clear();
    this.#detachSubagentFrames?.();
    this.#detachSubagentFrames = null;
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
      // A missing/unreadable file is transient (a brand-new session is not
      // written yet). Leave the revision dirty so the next refresh retries
      // instead of marking an empty transcript as loaded.
      if (!history) break;
      this.#loadedRevision = revision;
      this.#machine.applyHistory(history.messages, history.entryIds);
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
