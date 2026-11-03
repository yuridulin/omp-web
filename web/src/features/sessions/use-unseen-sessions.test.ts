import { describe, expect, it } from "vitest";
import type { SessionSummary } from "@/api/workspace";
import {
  advanceSeenSessions,
  parseSeenSessions,
  sessionActivityTime,
  unseenSessionIds,
  type SeenSessions,
} from "./use-unseen-sessions";

const NOW = Date.parse("2026-10-20T12:00:00.000Z");

function minutesAgo(minutes: number): string {
  return new Date(NOW - minutes * 60_000).toISOString();
}

function session(id: string, overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id,
    path: `/sessions/${id}.jsonl`,
    cwd: "/work/alpha",
    created: minutesAgo(600),
    modified: minutesAgo(60),
    messageCount: 3,
    firstMessage: "",
    ...overrides,
  };
}

describe("sessionActivityTime", () => {
  it("prefers the last message and falls back to the file time", () => {
    expect(sessionActivityTime(session("a", { lastMessageAt: minutesAgo(2) }))).toBe(NOW - 120_000);
    expect(sessionActivityTime(session("b", { modified: minutesAgo(5) }))).toBe(NOW - 300_000);
    expect(sessionActivityTime(session("c", { lastMessageAt: "junk", modified: "junk" }))).toBe(0);
  });
});

describe("parseSeenSessions", () => {
  it("keeps finite numbers and ignores everything else", () => {
    expect(parseSeenSessions(null)).toEqual({});
    expect(parseSeenSessions("{")).toEqual({});
    expect(parseSeenSessions("[]")).toEqual({});
    expect(parseSeenSessions(JSON.stringify({ a: 5, b: "6", c: null, d: Number.POSITIVE_INFINITY }))).toEqual({
      a: 5,
    });
  });
});

describe("unseenSessionIds", () => {
  it("marks only finished sessions newer than their read cursor", () => {
    const sessions = [
      session("newer", { lastMessageAt: minutesAgo(1) }),
      session("equal", { lastMessageAt: minutesAgo(5) }),
      session("older", { lastMessageAt: minutesAgo(30) }),
      session("running", { lastMessageAt: minutesAgo(1) }),
      session("never-seen", { lastMessageAt: minutesAgo(1) }),
      session("selected", { lastMessageAt: minutesAgo(1) }),
    ];
    const seen: SeenSessions = {
      newer: NOW - 300_000,
      equal: NOW - 300_000,
      older: NOW - 300_000,
      running: NOW - 300_000,
      selected: NOW - 300_000,
    };

    expect(
      unseenSessionIds(seen, sessions, new Set(["running"]), "selected"),
    ).toEqual(["newer"]);
  });
});

describe("advanceSeenSessions", () => {
  it("baselines first sightings without producing unread dots", () => {
    const sessions = [session("a", { lastMessageAt: minutesAgo(10) })];
    const next = advanceSeenSessions({}, sessions, null);
    expect(next).toEqual({ a: NOW - 600_000 });
    expect(unseenSessionIds(next ?? {}, sessions, new Set(), null)).toEqual([]);

    expect(advanceSeenSessions(next ?? {}, sessions, null)).toBeNull();
  });

  it("moves the open session cursor as it grows and clears its dot", () => {
    const sessions = [session("a", { lastMessageAt: minutesAgo(10) })];
    const baseline = advanceSeenSessions({}, sessions, null) ?? {};

    const grown = [session("a", { lastMessageAt: minutesAgo(1) })];
    expect(unseenSessionIds(baseline, grown, new Set(), null)).toEqual(["a"]);

    const viewed = advanceSeenSessions(baseline, grown, "a");
    expect(viewed).toEqual({ a: NOW - 60_000 });
    expect(unseenSessionIds(viewed ?? {}, grown, new Set(), "a")).toEqual([]);
    expect(unseenSessionIds(viewed ?? {}, grown, new Set(), null)).toEqual([]);
  });

  it("keeps a background completion unread until the session is opened", () => {
    const idle = [session("bg", { lastMessageAt: minutesAgo(10) })];
    let seen = advanceSeenSessions({}, idle, null) ?? {};
    expect(unseenSessionIds(seen, idle, new Set(), null)).toEqual([]);

    const running = [session("bg", { lastMessageAt: minutesAgo(1) })];
    expect(unseenSessionIds(seen, running, new Set(["bg"]), null)).toEqual([]);

    const finished = [session("bg", { lastMessageAt: minutesAgo(0) })];
    expect(unseenSessionIds(seen, finished, new Set(), null)).toEqual(["bg"]);

    seen = advanceSeenSessions(seen, finished, "bg") ?? seen;
    expect(unseenSessionIds(seen, finished, new Set(), null)).toEqual([]);
  });
});
