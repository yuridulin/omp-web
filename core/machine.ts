import type { AgentMessage, UserMessage } from "@/lib/types";
import type { AgentCommand, Clock, Transport } from "./ports";
import { systemClock } from "./ports";
import { reduce, type SessionAction } from "./reducer";
import { initialState, type SessionState } from "./state";

/**
 * Framework-free session controller.
 *
 * Owns one session's state, applies frames through the pure reducer, and maps
 * user intents to transport commands. A host (React, CLI, tests) subscribes for
 * snapshots; nothing here touches the DOM.
 */

export interface MachineOptions {
  transport: Transport;
  clock?: Clock;
}

export class SessionMachine {
  readonly #transport: Transport;
  readonly #clock: Clock;
  readonly #listeners = new Set<(state: SessionState) => void>();
  #state: SessionState;
  #unsubscribe: (() => void) | null = null;

  constructor(options: MachineOptions) {
    this.#transport = options.transport;
    this.#clock = options.clock ?? systemClock;
    this.#state = initialState();
  }

  get state(): SessionState {
    return this.#state;
  }

  subscribe(listener: (state: SessionState) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Attach to a session: resets the model and opens the live stream. */
  open(sessionId: string): void {
    this.close();
    this.#apply({ type: "reset", sessionId });
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

  /** Feed a committed transcript read (history load, catch-up, manual reload). */
  applyHistory(messages: AgentMessage[], entryIds: string[]): void {
    this.#apply({ type: "history", messages, entryIds });
  }

  /**
   * Send a prompt. The optimistic bubble is shown before the round trip and
   * withdrawn if the runtime refuses it, so the transcript never claims a turn
   * the agent did not accept.
   */
  async prompt(text: string): Promise<boolean> {
    const message: UserMessage = { role: "user", content: text, timestamp: this.#clock.now() };
    this.#apply({ type: "prompt", message });
    const result = await this.#send({ type: "prompt", message: text });
    this.#apply({
      type: "prompt-settled",
      accepted: result.ok,
      reason: result.ok ? undefined : result.error,
      at: this.#clock.now(),
    });
    return result.ok;
  }

  async abort(): Promise<boolean> {
    return this.#report({ type: "abort" });
  }

  async steer(text: string): Promise<boolean> {
    return this.#report({ type: "steer", message: text, streamingBehavior: "steer" });
  }

  async removeQueued(queue: "steering" | "followUp", message: string): Promise<boolean> {
    return this.#report({ type: "remove_queued_message", queue, message });
  }

  /** Run a command and surface a refusal as a notice; true when accepted. */
  async #report(command: AgentCommand): Promise<boolean> {
    const result = await this.#send(command);
    if (!result.ok) {
      this.#apply({
        type: "notice",
        notice: { id: `${command.type}-${this.#clock.now()}`, type: "error", message: result.error, at: this.#clock.now() },
      });
    }
    return result.ok;
  }

  #send(command: AgentCommand) {
    return this.#transport.send(this.#requireSession(), command);
  }

  #requireSession(): string {
    const sessionId = this.#state.sessionId;
    if (!sessionId) throw new Error("SessionMachine.open(sessionId) must run before commands");
    return sessionId;
  }

  #apply(action: SessionAction): void {
    const next = reduce(this.#state, action);
    if (next === this.#state) return;
    this.#state = next;
    for (const listener of this.#listeners) listener(next);
  }
}
