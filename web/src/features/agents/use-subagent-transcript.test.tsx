import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { SubagentRow, SubagentsFrame } from "@/api/subagents";
import { applySubagentsFrame, resetSubagentRosters } from "@/state/subagents-store";

const fetchSubagentPage = vi.fn();

vi.mock("@/api/subagents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/subagents")>();
  return { ...actual, fetchSubagentPage: (...args: unknown[]) => fetchSubagentPage(...args) };
});

const { useSubagentTranscript } = await import("./use-subagent-transcript");

function row(overrides: Partial<SubagentRow> = {}): SubagentRow {
  return {
    id: "Scout",
    agent: "scout",
    status: "started",
    index: 0,
    transcriptAvailable: true,
    ...overrides,
  } as SubagentRow;
}

function frame(versions: Record<string, number>, status: SubagentRow["status"] = "started"): SubagentsFrame {
  return {
    type: "subagents",
    revision: 1,
    live: true,
    roster: [row({ status })],
    activity: {},
    transcriptVersions: versions,
  };
}

// The page carries AgentMessages (already mapped server-side), not raw entries.
const message = (role: string, content: string) => ({ role, content, timestamp: 1 });

beforeEach(() => {
  resetSubagentRosters();
  fetchSubagentPage.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useSubagentTranscript", () => {
  it("opens on the tail page and reports whether older content exists", async () => {
    fetchSubagentPage.mockResolvedValue({
      sessionFile: "Scout.jsonl",
      fromByte: 1000,
      nextByte: 2000,
      reset: false,
      messages: [message("user", "late step")],
      totalBytes: 2000,
    });

    const { result } = renderHook(() => useSubagentTranscript("s1", "Scout"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchSubagentPage).toHaveBeenCalledWith("s1", "Scout", { mode: "tail" });
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.hasOlder).toBe(true);
    expect(result.current.fromByte).toBe(1000);
    expect(result.current.nextByte).toBe(2000);
  });

  it("fetches the next page when the roster bumps this subagent's transcript version", async () => {
    fetchSubagentPage
      .mockResolvedValueOnce({ fromByte: 0, nextByte: 500, reset: false, messages: [message("user", "first")], totalBytes: 900 })
      .mockResolvedValueOnce({ fromByte: 500, nextByte: 900, reset: false, messages: [message("assistant", "second")], totalBytes: 900 });

    const { result } = renderHook(() => useSubagentTranscript("s1", "Scout"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      applySubagentsFrame("s1", frame({ Scout: 2 }));
    });

    await waitFor(() => expect(result.current.messages).toHaveLength(2), { timeout: 2000 });
    expect(fetchSubagentPage).toHaveBeenLastCalledWith("s1", "Scout", { fromByte: 500 });
    expect(result.current.nextByte).toBe(900);
  });

  it("pages backwards without dropping or duplicating the loaded window", async () => {
    fetchSubagentPage
      .mockResolvedValueOnce({ fromByte: 500, nextByte: 900, reset: false, messages: [message("assistant", "second")], totalBytes: 900 })
      .mockResolvedValueOnce({ fromByte: 0, nextByte: 500, reset: false, messages: [message("user", "first")], totalBytes: 900 });

    const { result } = renderHook(() => useSubagentTranscript("s1", "Scout"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.loadOlder());

    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(fetchSubagentPage).toHaveBeenLastCalledWith("s1", "Scout", { mode: "before", beforeByte: 500 });
    expect(result.current.messages[0]?.content).toBe("first");
    expect(result.current.hasOlder).toBe(false);
    expect(result.current.fromByte).toBe(0);
  });

  it("surfaces a page failure instead of an endless spinner", async () => {
    fetchSubagentPage.mockRejectedValue(new Error("Subagent transcript not found"));

    const { result } = renderHook(() => useSubagentTranscript("s1", "Ghost"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Subagent transcript not found");
    expect(result.current.messages).toEqual([]);
  });
});
