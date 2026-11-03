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
    seed("running");
    snapshotMock.mockResolvedValue({ running: false, snapshot: null });

    renderHook(() => useSessionReconcile("s1"));
    await act(async () => {});

    expect(getSessionSnapshot("s1")?.session.run.status).toBe("idle");
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
