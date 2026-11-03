import { describe, expect, it } from "vitest";
import { parseSubagentsFrame } from "./subagents";

describe("parseSubagentsFrame", () => {
  it("keeps a well-formed roster and its activity", () => {
    const parsed = parseSubagentsFrame({
      type: "subagents",
      revision: 4,
      live: true,
      roster: [{ id: "Scout", agent: "scout", status: "started", index: 0, transcriptAvailable: true }],
      activity: { Scout: [{ kind: "tool", label: "→ read a.ts", ts: 10 }] },
    });

    expect(parsed?.revision).toBe(4);
    expect(parsed?.live).toBe(true);
    expect(parsed?.roster).toHaveLength(1);
    expect(parsed?.activity.Scout).toHaveLength(1);
  });

  it("drops rows and activity entries it cannot render instead of failing the frame", () => {
    const parsed = parseSubagentsFrame({
      type: "subagents",
      revision: 1,
      roster: [
        { id: "Scout", agent: "scout", status: "started", index: 0, transcriptAvailable: true },
        { agent: "scout", status: "started" },
        { id: "Ghost", agent: "scout", status: "weird" },
        null,
      ],
      activity: {
        Scout: [{ kind: "tool", label: "ok", ts: 1 }, { kind: "nope", label: "bad", ts: 2 }, { label: "ts missing" }],
        Broken: "not-an-array",
      },
    });

    expect(parsed?.roster.map((row) => row.id)).toEqual(["Scout", "Ghost"]);
    expect(parsed?.activity.Scout).toHaveLength(1);
    expect(parsed?.activity.Broken).toBeUndefined();
  });

  it("returns null for a frame that is not a subagents snapshot", () => {
    expect(parseSubagentsFrame(null)).toBeNull();
    expect(parseSubagentsFrame({ type: "snapshot" })).toBeNull();
    expect(parseSubagentsFrame({ type: "subagents", roster: [] })).toBeNull();
    expect(parseSubagentsFrame({ type: "subagents", revision: 1, roster: "nope" })).toBeNull();
  });
});
