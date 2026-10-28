import type { AgentMessage, UserMessage } from "./types";
import { branchReducer, initialBranching, type BranchingState } from "./branching";
import { type ChatIntent, isLocalIntent, toFrame } from "./commands";
import { EMPTY_DRAFT, isDraftEmpty, parseDraft, serializeDraft, type Draft } from "./drafts";
import type { AgentCommand, Clock, DraftStorage, Transport } from "./ports";
import { systemClock } from "./ports";
import { reduce, type SessionAction } from "./reducer";
import { initialState, type SessionState } from "./state";

/**
 * Framework-free session controller.
 *
 * Owns one conversation: transcript, run, queue, view, branching gate and draft.
 * Every front end drives it through `dispatch(intent)` and renders `snapshot`;
 * nothing here touches the DOM, fetch, storage or timers.
 */

export interface MachineOptions {
  transport: Transport;
  clock?: Clock;
  /** Optional persistence for drafts; in-memory only when omitted. */
  storage?: DraftStorage;
}

export interface Snapshot {
  session: SessionState;
  branching: BranchingState;
  draft: Draft;
}

export interface DispatchResult {
  ok: boolean;
  reason?: string;
  /** Payload of a command the host must act on (a fork's new session id). */
  data?: unknown;
}

export class SessionMachine {
  readonly #transport: Transport;
  readonly #clock: Clock;
  readonly #storage: DraftStorage | null;
  readonly #listeners = new Set<(snapshot: Snapshot) => void>();
  #session: SessionState;
  #branching: BranchingState = initialBranching;
  #draft: Draft = EMPTY_DRAFT;
  #unsubscribe: (() => void) | null = null;

  constructor(options: MachineOptions) {
    this.#transport = options.transport;
    this.#clock = options.clock ?? systemClock;
    this.#storage = options.storage ?? null;
    this.#session = initialState();
  }

  get state(): SessionState {
    return this.#session;
  }

  get draft(): Draft {
    return this.#draft;
  }

  get snapshot(): Snapshot {
    return { session: this.#session, branching: this.#branching, draft: this.#draft };
  }

  subscribe(listener: (snapshot: Snapshot) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Attach to a session: resets the model, restores its draft, opens the stream. */
  open(sessionId: string): void {
    this.close();
    this.#apply({ type: "reset", sessionId });
    // Read before writing: the reset path must not erase the stored draft.
    this.#setDraft(this.#readDraft(sessionId));
    this.#apply({ type: "connection", status: "connecting" });
    this.#unsubscribe = this.#transport.open(sessionId, {
      onFrame: (frame) => this.#apply({ type: "frame", frame, at: this.#clock.now() }),
      onStatus: (status, streamId) => this.#apply({ type: "connection", status, streamId }),
    });
  }

  close(): void {
    if (!this.#unsubscribe) return;
    this.#unsubscribe();
    this.#unsubscribe = null;
    this.#apply({ type: "connection", status: "closed" });
  }

  /** Feed a committed transcript read (initial load, catch-up, manual reload). */
  applyHistory(messages: AgentMessage[], entryIds: string[]): void {
    this.#apply({ type: "history", messages, entryIds });
  }

  /**
   * The single entry point for every front end. Local intents change what is
   * shown; the rest become one frame and are reported as accepted or refused.
   */
  async dispatch(intent: ChatIntent): Promise<DispatchResult> {
    if (isLocalIntent(intent)) return this.#dispatchLocal(intent);

    switch (intent.kind) {
      case "prompt":
        return this.#prompt(intent.text, intent.images);
      case "edit-entry": {
        if (this.#branching.editingEntryId === null && this.#branching.forkingEntryId !== null) {
          return { ok: false, reason: "A fork is already in flight for this session." };
        }
        this.#applyBranching({ type: "edit-begin", entryId: intent.entryId });
        const result = await this.#sendCommand(intent);
        this.#applyBranching({ type: "edit-settled" });
        return result;
      }
      case "fork-entry": {
        if (this.#branching.forkingEntryId === null && this.#branching.editingEntryId !== null) {
          return { ok: false, reason: "An edit is already in flight for this session." };
        }
        this.#applyBranching({ type: "fork-begin", entryId: intent.entryId });
        const result = await this.#sendCommand(intent);
        this.#applyBranching({ type: "fork-settled" });
        return result;
      }
      default:
        return this.#sendCommand(intent);
    }
  }

  #dispatchLocal(intent: ChatIntent): DispatchResult {
    switch (intent.kind) {
      case "navigate-leaf":
        this.#apply({ type: "view", view: { leafId: intent.leafId } });
        this.#applyBranching({ type: "leaf-select", leafId: intent.leafId });
        return { ok: true };
      case "toggle-pre-compaction":
        this.#apply({
          type: "view",
          view: { includePreCompaction: !this.#session.view.includePreCompaction },
        });
        return { ok: true };
      case "draft-edit":
        this.#setDraft({
          value: intent.patch.text ?? this.#draft.value,
          images: intent.patch.images ?? this.#draft.images,
          files: intent.patch.files ?? this.#draft.files,
        });
        return { ok: true };
      case "draft-clear":
        this.#setDraft(EMPTY_DRAFT);
        return { ok: true };
      default:
        return { ok: false, reason: `Not a local intent: ${intent.kind}` };
    }
  }

  async #prompt(text: string, images?: readonly unknown[]): Promise<DispatchResult> {
    const message: UserMessage = { role: "user", content: text, timestamp: this.#clock.now() };
    this.#apply({ type: "prompt", message });
    const result = await this.#transport.send(this.#requireSession(), {
      type: "prompt",
      message: text,
      ...(images && images.length ? { images } : {}),
    });
    this.#apply({
      type: "prompt-settled",
      accepted: result.ok,
      reason: result.ok ? undefined : result.error,
      at: this.#clock.now(),
    });
    return { ok: result.ok, reason: result.ok ? undefined : result.error, data: result.ok ? result.data : undefined };
  }

  async #sendCommand(intent: ChatIntent): Promise<DispatchResult> {
    const frame = toFrame(intent);
    if (!frame) return { ok: true };
    const result = await this.#transport.send(this.#requireSession(), frame);
    if (result.ok) return { ok: true, data: result.data };
    this.#apply({
      type: "notice",
      notice: {
        id: `${frame.type}:${this.#clock.now()}`,
        type: "error",
        message: result.error,
        at: this.#clock.now(),
      },
    });
    return { ok: false, reason: result.error };
  }

  #setDraft(next: Draft): void {
    if (isDraftEmpty(next)) {
      this.#draft = EMPTY_DRAFT;
      const sessionId = this.#session.sessionId;
      if (sessionId) this.#storage?.remove(sessionId);
      this.#emit();
      return;
    }
    this.#draft = next;
    const sessionId = this.#session.sessionId;
    const serialized = serializeDraft(next);
    if (sessionId && serialized) this.#storage?.write(sessionId, serialized);
    this.#emit();
  }

  #readDraft(sessionId: string): Draft {
    const raw = this.#storage?.read(sessionId);
    return parseDraft(raw) ?? EMPTY_DRAFT;
  }

  #requireSession(): string {
    const sessionId = this.#session.sessionId;
    if (!sessionId) throw new Error("SessionMachine.open(sessionId) must run before commands");
    return sessionId;
  }

  #apply(action: SessionAction): void {
    const next = reduce(this.#session, action);
    if (next === this.#session) return;
    this.#session = next;
    this.#emit();
  }

  #applyBranching(action: Parameters<typeof branchReducer>[1]): void {
    const next = branchReducer(this.#branching, action);
    if (next === this.#branching) return;
    this.#branching = next;
    this.#emit();
  }

  #emit(): void {
    const snapshot = this.snapshot;
    for (const listener of this.#listeners) listener(snapshot);
  }
}

