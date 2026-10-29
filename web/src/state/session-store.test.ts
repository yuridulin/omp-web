import { beforeEach, describe, expect, it } from "vitest";
import type { SessionSnapshot, SnapshotFrame } from "@/api/session-types";
import {
  applySnapshotFrame,
  getSessionSnapshot,
  resetSessionSnapshots,
  subscribeSession,
} from "./session-store";

function snapshot(overrides: Partial<SessionSnapshot["session"]> = {}): SessionSnapshot {
  return {
    session: {
      sessionId: "s1",
      connection: "open",
      streamId: "stream-1",
      sequence: 1,
      run: { status: "idle", error: null },
      messages: [],
      entryIds: [],
      stream: { active: false, message: null, held: false },
      queue: { steering: [], followUp: [] },
      notices: [],
      historyRevision: 1,
      lastError: null,
      ...overrides,
    },
    branching: {},
    draft: { value: "", images: [], files: [] },
  };
}

function frame(value: SessionSnapshot, history: boolean): SnapshotFrame {
  return { type: "snapshot", revision: value.session.historyRevision, history, snapshot: value };
}

beforeEach(() => resetSessionSnapshots());

describe("session snapshot store", () => {
  it("replaces state when a history frame arrives", () => {
    const message = { role: "user", content: "hello", timestamp: 1 };
    applySnapshotFrame("s1", frame(snapshot({ messages: [message], entryIds: ["e1"] }), true));
    expect(getSessionSnapshot("s1")?.session.messages).toEqual([message]);
    expect(getSessionSnapshot("s1")?.session.entryIds).toEqual(["e1"]);
  });

  it("merges delta frames without dropping the transcript", () => {
    const message = { role: "user", content: "hello", timestamp: 1 };
    applySnapshotFrame("s1", frame(snapshot({ messages: [message], entryIds: ["e1"] }), true));

    const delta = snapshot({ connection: "reconnecting", sequence: 7, historyRevision: 2 });
    delete delta.session.messages;
    delete delta.session.entryIds;
    applySnapshotFrame("s1", frame(delta, false));

    const merged = getSessionSnapshot("s1");
    expect(merged?.session.connection).toBe("reconnecting");
    expect(merged?.session.sequence).toBe(7);
    expect(merged?.session.messages).toEqual([message]);
    expect(merged?.session.entryIds).toEqual(["e1"]);
  });

  it("notifies only subscribers of the changed session", () => {
    let first = 0;
    let second = 0;
    const offFirst = subscribeSession("s1", () => { first += 1; });
    subscribeSession("s2", () => { second += 1; });

    applySnapshotFrame("s1", frame(snapshot(), true));
    expect(first).toBe(1);
    expect(second).toBe(0);

    offFirst();
    applySnapshotFrame("s1", frame(snapshot({ sequence: 2 }), false));
    expect(first).toBe(1);
  });
});
