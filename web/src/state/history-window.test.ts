import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getHistoryWindow,
  openHistoryWindow,
  resetHistoryWindows,
  syncHistoryWindow,
} from "./history-window";

const TAIL = {
  mode: "replace",
  hasOlder: false,
  hasMore: false,
  cursor: { firstEntryId: "a", lastEntryId: "a" },
  context: { messages: [{ role: "user", content: "hello" }], entryIds: ["a"] },
};

const FORWARD = {
  mode: "append",
  hasOlder: false,
  hasMore: false,
  cursor: { firstEntryId: "a", lastEntryId: "a" },
  context: { messages: [], entryIds: [] },
};

function page(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  resetHistoryWindows();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("history window page reads", () => {
  it("retries a transient failure instead of leaving the transcript stale", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(page(TAIL))
      .mockResolvedValueOnce(page(FORWARD));
    vi.stubGlobal("fetch", fetchMock);

    await openHistoryWindow("s1");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(getHistoryWindow("s1").messages).toEqual([{ role: "user", content: "hello" }]);
  });

  it("retries a server-side history race (5xx) but not a real 4xx answer", async () => {
    const raced = vi
      .fn()
      .mockResolvedValueOnce(page({ error: "Session changed while reading history" }, 500))
      .mockResolvedValueOnce(page(TAIL))
      .mockResolvedValueOnce(page(FORWARD));
    vi.stubGlobal("fetch", raced);
    await openHistoryWindow("s2");
    expect(raced).toHaveBeenCalledTimes(3);
    expect(getHistoryWindow("s2").messages).toHaveLength(1);

    resetHistoryWindows();
    const missing = vi.fn().mockResolvedValue(page({ error: "Session not found" }, 404));
    vi.stubGlobal("fetch", missing);
    await openHistoryWindow("s3");
    expect(missing).toHaveBeenCalledTimes(1);
    expect(getHistoryWindow("s3").messages).toEqual([]);
  });

  it("recovers a forward sync that failed at the end of a run", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(page(TAIL)).mockResolvedValueOnce(page(FORWARD)));
    await openHistoryWindow("s4");
    expect(getHistoryWindow("s4").messages).toHaveLength(1);

    const newer = {
      ...FORWARD,
      context: { messages: [{ role: "assistant", content: "answer" }], entryIds: ["b"] },
      cursor: { firstEntryId: "a", lastEntryId: "b" },
    };
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(page(newer));
    vi.stubGlobal("fetch", fetchMock);

    await syncHistoryWindow("s4");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getHistoryWindow("s4").messages.at(-1)).toEqual({ role: "assistant", content: "answer" });
  });
});
