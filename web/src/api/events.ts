/** SSE parsing and the single multiplexed `/api/agent/events` connection. */

export interface SseFrame {
  event: string;
  data: string;
}

/**
 * Incremental SSE parser: chunks may split anywhere, including inside a frame.
 * Comments (`:...`) and unknown fields are ignored.
 */
export function createSseParser(onFrame: (frame: SseFrame) => void): (chunk: string) => void {
  let buffer = "";
  return (chunk) => {
    buffer = (buffer + chunk).replace(/\r\n/g, "\n");
    let index = buffer.indexOf("\n\n");
    while (index >= 0) {
      const raw = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const frame = parseFrame(raw);
      if (frame) onFrame(frame);
      index = buffer.indexOf("\n\n");
    }
  };
}

function parseFrame(raw: string): SseFrame | null {
  let event = "";
  const data: string[] = [];
  for (const line of raw.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (!event) return null;
  return { event, data: data.join("\n") };
}

export type Channel =
  | { kind: "running" }
  | { kind: "session"; sessionId: string }
  | { kind: "subagents"; sessionId: string }
  | { kind: "workspace"; root: string }
  | { kind: "lsp"; root: string }
  | { kind: "file"; path: string; sessionId: string | null }
  | { kind: "notifications"; clientId: string }
  | { kind: "host-tools" };

export type FrameHandler = (frame: { type: string; [key: string]: unknown }) => void;

interface Subscription {
  channel: Channel;
  handler: FrameHandler;
}

const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 5000;

/**
 * One browser SSE connection, multiplexed by subscription id. Reconnect means:
 * reopen, re-subscribe, and let the first snapshot replace client state.
 */
export class EventStreamClient {
  readonly #subscriptions = new Map<string, Subscription>();
  readonly #controller = new AbortController();
  #socket = new AbortController();
  #ready = openReady();
  #connectionId: string | null = null;
  #nextId = 1;
  #epoch = 0;
  #started = false;
  #closed = false;
  /** Skip the reconnect backoff once; a 404 means this socket is already dead. */
  #immediate = false;
  #recovering: Promise<void> | null = null;

  start(): Promise<void> {
    if (!this.#started) {
      this.#started = true;
      void this.#run();
    }
    return this.#ready.promise;
  }

  async subscribe(channel: Channel, handler: FrameHandler): Promise<() => void> {
    await this.start();
    const id = `s${this.#nextId++}`;
    this.#subscriptions.set(id, { channel, handler });
    try {
      await this.#postSubscription(id);
    } catch (error) {
      // A 409 means the session has no live wrapper; keep retrying would just
      // repeat the failure on every reconnect. Network failures stay queued.
      if (String(error).includes("409")) this.#subscriptions.delete(id);
      throw error;
    }
    return () => {
      this.#subscriptions.delete(id);
      if (this.#connectionId) void this.#post({ unsubscribe: id }).catch(() => {});
    };
  }

  close(): void {
    this.#closed = true;
    this.#controller.abort();
    this.#socket.abort();
    this.#ready.reject(new DOMException("The event stream was closed", "AbortError"));
    this.#subscriptions.clear();
  }

  async #run(): Promise<void> {
    let delay = RECONNECT_MIN_MS;
    while (!this.#closed) {
      try {
        await this.#connect();
        delay = RECONNECT_MIN_MS;
      } catch {
        if (this.#closed) return;
        if (this.#immediate) {
          this.#immediate = false;
          continue;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(RECONNECT_MAX_MS, delay * 2);
      }
    }
  }

  async #connect(): Promise<void> {
    const epoch = this.#epoch;
    const response = await fetch("/api/agent/events", {
      signal: linkAbort(this.#controller.signal, this.#socket.signal),
      headers: { accept: "text/event-stream" },
    });
    if (!response.ok || !response.body) {
      throw new Error(`Event stream failed: HTTP ${response.status}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parse = createSseParser((frame) => {
      if (epoch === this.#epoch) this.#dispatch(frame);
    });
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (epoch !== this.#epoch) return;
        if (done) return;
        parse(decoder.decode(value, { stream: true }));
      }
    } finally {
      reader.releaseLock();
      if (epoch === this.#epoch) this.#connectionId = null;
    }
  }

  #dispatch(frame: SseFrame): void {
    if (frame.event === "mux") {
      const control = safeParse(frame.data);
      if (control?.type === "hello" && typeof control.connectionId === "string") {
        this.#connectionId = control.connectionId;
        this.#ready.resolve();
        void this.#resubscribe();
      }
      return;
    }
    const subscription = this.#subscriptions.get(frame.event);
    if (!subscription) return;
    const payload = safeParse(frame.data);
    if (payload && typeof payload.type === "string") subscription.handler({ ...payload, type: payload.type });
  }

  async #resubscribe(): Promise<void> {
    for (const [id, subscription] of this.#subscriptions) {
      try {
        await this.#post({ subscribe: { id, channel: subscription.channel } });
      } catch {
        // One invalid channel must not block the others; the next hello retries.
        continue;
      }
    }
  }

  async #postSubscription(id: string): Promise<void> {
    const subscription = this.#subscriptions.get(id);
    if (!subscription) return;
    const body = { subscribe: { id, channel: subscription.channel } };
    try {
      await this.#post(body);
    } catch (error) {
      // 404 is `unknown_connection`: the server restarted or dropped this
      // socket, and the GET may still look open. Open a new one and retry once.
      if (!String(error).includes("404") || !this.#subscriptions.has(id)) throw error;
      await this.#recover();
      if (!this.#subscriptions.has(id)) return;
      await this.#post(body);
    }
  }

  async #recover(): Promise<void> {
    if (this.#recovering) return this.#recovering;
    const pending = (async () => {
      const previous = this.#socket;
      this.#epoch += 1;
      this.#connectionId = null;
      this.#ready = openReady();
      this.#socket = new AbortController();
      this.#immediate = true;
      previous.abort();
      await this.#ready.promise;
    })();
    this.#recovering = pending;
    try {
      await pending;
    } finally {
      if (this.#recovering === pending) this.#recovering = null;
    }
  }

  async #post(body: Record<string, unknown>): Promise<void> {
    const connectionId = this.#connectionId;
    if (!connectionId) throw new Error("Event stream is not connected");
    const response = await fetch("/api/agent/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ connectionId, ...body }),
      signal: this.#controller.signal,
    });
    if (!response.ok) throw new Error(`Event subscription failed: HTTP ${response.status}`);
  }
}

/** A pending hello. The extra catch keeps close() from surfacing as an unhandled rejection. */
function openReady(): PromiseWithResolvers<void> {
  const ready = Promise.withResolvers<void>();
  ready.promise.catch(() => {});
  return ready;
}

/** Abort when either signal aborts. The link itself is not aborted later. */
function linkAbort(first: AbortSignal, second: AbortSignal): AbortSignal {
  const linked = new AbortController();
  const abort = () => linked.abort();
  if (first.aborted || second.aborted) {
    linked.abort();
    return linked.signal;
  }
  first.addEventListener("abort", abort, { once: true });
  second.addEventListener("abort", abort, { once: true });
  return linked.signal;
}

function safeParse(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    return Object.fromEntries(Object.entries(value));
  } catch {
    return null;
  }
}
