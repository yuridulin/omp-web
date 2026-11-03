import { describe, expect, it } from "vitest";
import type { ProjectSummary, SessionSummary } from "@/api/workspace";
import {
  buildRailView,
  compareSessions,
  matchesSession,
  normalizeQuery,
  relativeTimeLabel,
  sessionLabel,
} from "./rail-view";

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

function project(path: string, overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return { path, ...overrides };
}

describe("relativeTimeLabel", () => {
  it("floors into short buckets", () => {
    expect(relativeTimeLabel(minutesAgo(0.4), NOW)).toBe("now");
    expect(relativeTimeLabel(minutesAgo(5), NOW)).toBe("5m");
    expect(relativeTimeLabel(minutesAgo(59), NOW)).toBe("59m");
    expect(relativeTimeLabel(minutesAgo(180), NOW)).toBe("3h");
    expect(relativeTimeLabel(minutesAgo(60 * 24 * 2), NOW)).toBe("2d");
    expect(relativeTimeLabel(minutesAgo(60 * 24 * 10), NOW)).toBe("1w");
    expect(relativeTimeLabel(minutesAgo(60 * 24 * 45), NOW)).toBe("1mo");
    expect(relativeTimeLabel(minutesAgo(60 * 24 * 400), NOW)).toBe("1y");
  });

  it("treats a clock skew as now and malformed input as blank", () => {
    expect(relativeTimeLabel(minutesAgo(-10), NOW)).toBe("now");
    expect(relativeTimeLabel("not a date", NOW)).toBe("");
    expect(relativeTimeLabel(null, NOW)).toBe("");
    expect(relativeTimeLabel(undefined, NOW)).toBe("");
  });
});

describe("sessionLabel", () => {
  it("keeps a stored emoji and trims whitespace", () => {
    expect(sessionLabel(session("a", { name: "  🎮 Games sprint  " }))).toBe("🎮 Games sprint");
    expect(sessionLabel(session("b", { name: "Ship 🚀 release" }))).toBe("Ship 🚀 release");
  });

  it("falls back to the id prefix when the name is empty", () => {
    expect(sessionLabel(session("abcdef123456", { name: "   " }))).toBe("abcdef12");
    expect(sessionLabel(session("123456789"))).toBe("12345678");
  });
});

describe("compareSessions", () => {
  it("sorts newest first and breaks ties by id", () => {
    const older = session("b", { lastMessageAt: minutesAgo(30) });
    const newer = session("a", { lastMessageAt: minutesAgo(5) });
    const newest = session("c", { lastMessageAt: minutesAgo(1) });

    expect([older, newest, newer].sort(compareSessions).map((item) => item.id)).toEqual([
      "c",
      "a",
      "b",
    ]);

    const first = session("z", { lastMessageAt: minutesAgo(5) });
    const second = session("y", { lastMessageAt: minutesAgo(5) });
    expect([first, second].sort(compareSessions).map((item) => item.id)).toEqual(["y", "z"]);
  });

  it("sorts sessions without a usable date last", () => {
    const broken = session("broken", { modified: "not a date" });
    const dated = session("dated", { lastMessageAt: minutesAgo(600) });
    expect([broken, dated].sort(compareSessions).map((item) => item.id)).toEqual([
      "dated",
      "broken",
    ]);
  });
});

describe("normalizeQuery and matchesSession", () => {
  it("matches labels and working directories case-insensitively", () => {
    const needle = normalizeQuery("  ALPHA  ");
    expect(needle).toBe("alpha");
    expect(matchesSession(session("a", { name: "Alpha release" }), needle)).toBe(true);
    expect(matchesSession(session("b", { name: "Beta", cwd: "/work/Alpha" }), needle)).toBe(true);
    expect(matchesSession(session("c", { name: "Beta", cwd: "/work/beta" }), needle)).toBe(false);
    expect(matchesSession(session("d"), normalizeQuery(""))).toBe(true);
  });
});

describe("buildRailView", () => {
  it("groups registered projects with their alias and sorts sessions by recency", () => {
    const view = buildRailView({
      projects: [project("/work/alpha", { alias: "Alpha workspace" })],
      sessions: [
        session("old", { projectRoot: "/work/alpha", lastMessageAt: minutesAgo(120) }),
        session("new", { projectRoot: "/work/alpha", lastMessageAt: minutesAgo(3) }),
      ],
      running: new Set(),
      now: NOW,
    });

    expect(view.groups).toHaveLength(1);
    expect(view.groups[0]?.label).toBe("Alpha workspace");
    expect(view.groups[0]?.sessions.map((item) => item.id)).toEqual(["new", "old"]);
    expect(view.groups[0]?.sessions[0]?.time).toBe("3m");
    expect(view.groups[0]?.sessions[0]?.running).toBe(false);
  });

  it("discovers unregistered roots from projectRoot or cwd", () => {
    const view = buildRailView({
      projects: [],
      sessions: [
        session("rooted", { projectRoot: "/work/alpha", cwd: "/work/alpha/src" }),
        session("loose", { cwd: "/work/beta/packages/app" }),
      ],
      running: new Set(),
      now: NOW,
    });

    expect(view.groups.map((group) => group.label)).toEqual(["alpha", "app"]);
    expect(view.groups[1]?.sessions.map((item) => item.id)).toEqual(["loose"]);
    expect(view.groups[1]?.path).toBe("/work/beta/packages/app");
  });

  it("orders groups by pin, then sort, then label", () => {
    const view = buildRailView({
      projects: [
        project("/work/a", { alias: "Alpha", sortOrder: 2 }),
        project("/work/b", { alias: "Bravo" }),
        project("/work/c", { alias: "Charlie", pinOrder: 0, sortOrder: 9 }),
        project("/work/d", { alias: "Delta", sortOrder: 1 }),
      ],
      sessions: [],
      running: new Set(),
      now: NOW,
    });

    expect(view.groups.map((group) => group.label)).toEqual(["Charlie", "Delta", "Alpha", "Bravo"]);
  });

  it("treats Windows path casing as the same project", () => {
    const view = buildRailView({
      projects: [project("C:/Work/Alpha", { alias: "Alpha" })],
      sessions: [session("one", { projectRoot: "c:/work/alpha/" })],
      running: new Set(),
      now: NOW,
    });

    expect(view.groups).toHaveLength(1);
    expect(view.groups[0]?.sessions.map((item) => item.id)).toEqual(["one"]);
  });

  it("filters by title or path and keeps a group matched by its own label", () => {
    const view = buildRailView({
      projects: [
        project("/work/alpha", { alias: "Alpha" }),
        project("/work/beta", { alias: "Beta" }),
      ],
      sessions: [
        session("alpha-one", { projectRoot: "/work/alpha", name: "Fix parser" }),
        session("alpha-two", { projectRoot: "/work/alpha", name: "Ship docs" }),
        session("beta-one", { projectRoot: "/work/beta", name: "Parser review" }),
      ],
      running: new Set(),
      query: "  PARSER ",
      now: NOW,
    });

    expect(view.groups.map((group) => group.label)).toEqual(["Alpha", "Beta"]);
    expect((view.groups[0]?.sessions ?? []).map((item) => item.label)).toEqual(["Fix parser"]);
    expect((view.groups[1]?.sessions ?? []).map((item) => item.label)).toEqual(["Parser review"]);

    const byLabel = buildRailView({
      projects: [
        project("/work/alpha", { alias: "Alpha" }),
        project("/work/beta", { alias: "Beta" }),
      ],
      sessions: [
        session("alpha-one", { projectRoot: "/work/alpha", cwd: "/tmp/scratch", name: "Unrelated" }),
      ],
      running: new Set(),
      query: "alpha",
      now: NOW,
    });
    expect(byLabel.groups.map((group) => group.label)).toEqual(["Alpha"]);
    expect(byLabel.groups[0]?.sessions).toEqual([]);
  });

  it("keeps running sessions inside their project group, newest first", () => {
    const view = buildRailView({
      projects: [
        project("/work/alpha", { alias: "Alpha" }),
        project("/work/beta", { alias: "Beta" }),
      ],
      sessions: [
        session("alpha-run", { projectRoot: "/work/alpha", name: "Running", lastMessageAt: minutesAgo(20) }),
        session("beta-run", { projectRoot: "/work/beta", name: "Also running", lastMessageAt: minutesAgo(2) }),
        session("alpha-idle", { projectRoot: "/work/alpha", name: "Idle", lastMessageAt: minutesAgo(5) }),
      ],
      running: new Set(["alpha-run", "beta-run"]),
      now: NOW,
    });

    const alpha = view.groups.find((group) => group.label === "Alpha");
    expect(alpha?.sessions.map((item) => item.id)).toEqual(["alpha-idle", "alpha-run"]);
    expect(alpha?.sessions.map((item) => item.running)).toEqual([false, true]);
    const beta = view.groups.find((group) => group.label === "Beta");
    expect(beta?.sessions.map((item) => item.id)).toEqual(["beta-run"]);
    expect(beta?.sessions[0]?.running).toBe(true);
    expect(view.groups.flatMap((group) => group.sessions).filter((item) => item.running)).toHaveLength(2);
  });

  it("keeps only running sessions when the running filter is on", () => {
    const view = buildRailView({
      projects: [
        project("/work/alpha", { alias: "Alpha" }),
        project("/work/beta", { alias: "Beta" }),
        project("/work/gamma", { alias: "Gamma" }),
      ],
      sessions: [
        session("alpha-run", { projectRoot: "/work/alpha", name: "Live" }),
        session("beta-idle", { projectRoot: "/work/beta", name: "Idle" }),
      ],
      running: new Set(["alpha-run"]),
      runningOnly: true,
      now: NOW,
    });

    expect(view.groups.map((group) => group.label)).toEqual(["Alpha"]);
    expect(view.groups[0]?.sessions.map((item) => item.id)).toEqual(["alpha-run"]);
  });

  it("applies search to running sessions in their groups", () => {
    const view = buildRailView({
      projects: [project("/work/alpha", { alias: "Alpha" })],
      sessions: [
        session("match", { projectRoot: "/work/alpha", name: "Parser", lastMessageAt: minutesAgo(4) }),
        session("other", { projectRoot: "/work/alpha", name: "Docs", lastMessageAt: minutesAgo(2) }),
      ],
      running: new Set(["match", "other"]),
      query: "parse",
      now: NOW,
    });

    expect(view.groups).toHaveLength(1);
    expect(view.groups[0]?.sessions.map((item) => item.id)).toEqual(["match"]);
    expect(view.groups[0]?.sessions[0]?.running).toBe(true);
  });
});
