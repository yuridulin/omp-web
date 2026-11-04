import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSnapshot } from "@/api/session-types";
import { useSessionReconcile } from "./event-stream";
import { applySnapshotFrame, getSessionSnapshot, resetSessionSnapshots } from "./session-store";

const snapshotMock = vi.hoisted(() => vi.fn());

vi.mock("@/api/agent", () => ({ fetchSessionSnapshot: snapshotMock }));

function snapshotWith(status: "idle" | "running", revision = 7): SessionSnapshot {
  return {
    session: {
      sessionId: "s1",
      run: { status, error: null },
      historyRevision: revision,
    },
    branching: null,
    draft: { value: "", images: [], files: [] },
  } as unknown as SessionSnapshot;
}

function seed(status: "idle" | "running") {
  applySnapshotFrame("s1", {
    type: "snapshot",
    revision: 7,
    history: false,
    snapshot: snapshotWith(status),
  });
}

/** A snapshot mid-turn: a live message is streaming under the run. */
function seedStreaming(): void {
  applySnapshotFrame("s1", {
    type: "snapshot",
    revision: 7,
    history: false,
    snapshot: {
      ...snapshotWith("running"),
      session: {
        ...snapshotWith("running").session,
        stream: {
          active: true,
          message: { role: "assistant", content: [{ type: "thinking", thinking: "half a thought" }] },
          held: [],
        },
      },
    } as unknown as SessionSnapshot,
  });
}

beforeEach(() => {
  resetSessionSnapshots();
  snapshotMock.mockReset();
});

describe("useSessionReconcile", () => {
  it("re-reads the snapshot when a chat opens", async () => {
    snapshotMock.mockResolvedValue({ running: true, snapshot: snapshotWith("idle") });

    renderHook(() => useSessionReconcile("s1"));
    await act(async () => {});

    expect(snapshotMock).toHaveBeenCalledWith("s1");
    expect(getSessionSnapshot("s1")?.session.run.status).toBe("idle");
    expect(getSessionSnapshot("s1")?.session.historyRevision).toBe(7);
  });

  it("clears a stale running run when no process backs the session", async () => {
    seedStreaming();
    snapshotMock.mockResolvedValue({ running: false, snapshot: null });

    renderHook(() => useSessionReconcile("s1"));
    await act(async () => {});

    const session = getSessionSnapshot("s1")?.session;
    expect(session?.run.status).toBe("idle");
    // The half-streamed block is never going to finish: no frozen transcript
    // and no caret blinking over a turn that already ended.
    expect(session?.stream.active).toBe(false);
    expect(session?.stream.message).toBeNull();
  });

  it("re-reads the snapshot while the cached run still claims to be running", async () => {
    vi.useFakeTimers();
    try {
      seed("running");
      snapshotMock.mockResolvedValue({ running: true, snapshot: snapshotWith("running") });

      renderHook(() => useSessionReconcile("s1"));
      await act(async () => {});
      expect(snapshotMock).toHaveBeenCalledTimes(1);

      // A dead pipeline sends no frame to correct the cache; the timer does.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(snapshotMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-reads the snapshot when the tab becomes visible again", async () => {
    snapshotMock.mockResolvedValue({ running: true, snapshot: snapshotWith("idle") });
    renderHook(() => useSessionReconcile("s1"));
    await act(async () => {});
    snapshotMock.mockClear();

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(snapshotMock).toHaveBeenCalledWith("s1");
  });

  it("does nothing without a session", async () => {
    renderHook(() => useSessionReconcile(null));
    await act(async () => {});

    expect(snapshotMock).not.toHaveBeenCalled();
  });
});
