import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionReconcile } from "./event-stream";
import { getSessionSnapshot, resetSessionSnapshots } from "./session-store";

const snapshotMock = vi.hoisted(() => vi.fn());

vi.mock("@/api/agent", () => ({ fetchSessionSnapshot: snapshotMock }));

function idleSnapshot(revision = 7) {
  return {
    session: {
      sessionId: "s1",
      run: { status: "idle", error: null },
      historyRevision: revision,
    },
    branching: null,
    draft: { value: "", images: [], files: [] },
  };
}

beforeEach(() => {
  resetSessionSnapshots();
  snapshotMock.mockReset();
});

describe("useSessionReconcile", () => {
  it("re-reads the snapshot when a chat opens", async () => {
    snapshotMock.mockResolvedValue(idleSnapshot());

    renderHook(() => useSessionReconcile("s1"));
    await act(async () => {});

    expect(snapshotMock).toHaveBeenCalledWith("s1");
    expect(getSessionSnapshot("s1")?.session.run.status).toBe("idle");
    expect(getSessionSnapshot("s1")?.session.historyRevision).toBe(7);
  });

  it("re-reads the snapshot when the tab becomes visible again", async () => {
    snapshotMock.mockResolvedValue(idleSnapshot());
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
