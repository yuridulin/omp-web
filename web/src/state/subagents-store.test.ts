import { beforeEach, describe, expect, it } from "vitest";
import type { SubagentRow, SubagentsFrame } from "@/api/subagents";
import {
  applySubagentsFrame,
  getActiveSubagents,
  getAgentRoster,
  getSubagent,
  resetSubagentRosters,
  setSubagentsStreamError,
  subscribeAgentRoster,
} from "./subagents-store";

function row(overrides: Partial<SubagentRow> = {}): SubagentRow {
  return {
    id: "Scout",
    agent: "scout",
    status: "started",
    index: 0,
    transcriptAvailable: true,
    task: "Map the surface",
    ...overrides,
  } as SubagentRow;
}

function frame(overrides: Partial<SubagentsFrame> = {}): SubagentsFrame {
  return {
    type: "subagents",
    revision: 1,
    live: true,
    roster: [row()],
    activity: {},
    transcriptVersions: {},
    ...overrides,
  };
}

beforeEach(() => {
  resetSubagentRosters();
});

describe("subagent roster store", () => {
  it("replaces the roster with each complete snapshot and notifies subscribers", () => {
    const seen: number[] = [];
    const unsubscribe = subscribeAgentRoster("s1", () => seen.push(getAgentRoster("s1")?.revision ?? -1));

    applySubagentsFrame("s1", frame());
    applySubagentsFrame("s1", frame({ revision: 2, roster: [row(), row({ id: "Review", status: "completed" })] }));

    expect(seen).toEqual([1, 2]);
    expect(getAgentRoster("s1")?.roster.map((entry) => entry.id)).toEqual(["Scout", "Review"]);
    unsubscribe();
  });

  it("accepts a replayed snapshot after a reconnect instead of fencing on revision", () => {
    applySubagentsFrame("s1", frame({ revision: 7 }));
    // A restarted server renumbers from 1; the frame is a full snapshot.
    applySubagentsFrame("s1", frame({ revision: 1, roster: [row({ status: "completed" })] }));

    expect(getAgentRoster("s1")?.revision).toBe(1);
    expect(getAgentRoster("s1")?.roster[0]?.status).toBe("completed");
  });

  it("selects the running agents and keeps that array stable per snapshot", () => {
    applySubagentsFrame("s1", frame({
      roster: [row(), row({ id: "Review", status: "completed" }), row({ id: "Writer" })],
    }));

    const active = getActiveSubagents("s1");
    expect(active.map((entry) => entry.id)).toEqual(["Scout", "Writer"]);
    expect(getActiveSubagents("s1")).toBe(active);

    applySubagentsFrame("s1", frame({ revision: 2, roster: [row({ id: "Review", status: "completed" })] }));
    expect(getActiveSubagents("s1")).toEqual([]);
  });

  it("marks a refused channel without discarding the roster, and a frame clears it", () => {
    applySubagentsFrame("s1", frame());
    setSubagentsStreamError("s1", "Session not found");

    expect(getAgentRoster("s1")?.error).toBe("Session not found");
    expect(getAgentRoster("s1")?.roster).toHaveLength(1);

    applySubagentsFrame("s1", frame({ revision: 2, live: false }));
    expect(getAgentRoster("s1")?.error).toBeNull();
    expect(getAgentRoster("s1")?.live).toBe(false);
  });

  it("finds one row and reports an unknown session as null", () => {
    applySubagentsFrame("s1", frame({ roster: [row(), row({ id: "Review" })] }));

    expect(getSubagent("s1", "Review")?.id).toBe("Review");
    expect(getSubagent("s1", "Ghost")).toBeNull();
    expect(getAgentRoster("other")).toBeNull();
    expect(getActiveSubagents("other")).toEqual([]);
  });
});
