import assert from "node:assert/strict";
import { test } from "bun:test";

const {
  EMPTY_SUBAGENTS,
  activeSubagentCount,
  compareSubagents,
  mergeRoster,
  parseSubagentActivityEvent,
  parseSubagentLifecycle,
  parseSubagentProgress,
  reduceSubagents,
  resetSubagents,
} = await import("./subagents.ts");
// Test-only anti-drift check: the presentation hook still runs this fold.
const { mergeSubagentRoster } = await import("../lib/subagent-types.ts");

function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

const live = (id, over = {}) => ({ id, agent: "subagent", status: "started", index: 0, source: "live", ...over });
const history = (id, over = {}) => ({ id, agent: "subagent", status: "completed", index: 0, source: "history", ...over });

// ---------------------------------------------------------------------------
// Parsers

test("parseSubagentLifecycle requires an id and a known status", () => {
  assert.equal(parseSubagentLifecycle(null), null);
  assert.equal(parseSubagentLifecycle({}), null);
  assert.equal(parseSubagentLifecycle({ status: "started" }), null);
  assert.equal(parseSubagentLifecycle({ id: "a" }), null);
  assert.equal(parseSubagentLifecycle({ id: "a", status: "running" }), null);
  assert.equal(parseSubagentLifecycle({ id: "a", status: "exploded" }), null);
  // id must be a non-empty string, not merely truthy.
  assert.equal(parseSubagentLifecycle({ id: 7, status: "started" }), null);
});

test("parseSubagentLifecycle maps a valid frame with defaults", () => {
  const parsed = parseSubagentLifecycle(
    {
      id: "child-1",
      agent: "explorer",
      agentSource: "user",
      status: "started",
      index: 2,
      description: "look around",
      sessionFile: "/tmp/c.jsonl",
      parentToolCallId: "call-9",
      detached: true,
      lastUpdate: 999,
    },
    1234,
  );
  assert.deepEqual(parsed, {
    id: "child-1",
    agent: "explorer",
    agentSource: "user",
    status: "started",
    index: 2,
    description: "look around",
    sessionFile: "/tmp/c.jsonl",
    parentToolCallId: "call-9",
    detached: true,
    lastUpdate: 1234,
    source: "live",
  });

  const minimal = parseSubagentLifecycle({ id: "x", status: "completed" }, 5);
  assert.deepEqual(minimal, {
    id: "x",
    agent: "subagent",
    status: "completed",
    index: -1,
    lastUpdate: 5,
    source: "live",
  });
  // A wire-carried lastUpdate is not trusted over the frame stamp.
  assert.equal(minimal.lastUpdate, 5);
});

test("parseSubagentProgress keeps known fields and drops junk", () => {
  assert.equal(parseSubagentProgress(null), null);
  assert.equal(parseSubagentProgress({}), null);
  const parsed = parseSubagentProgress({
    id: "a",
    index: 3,
    status: "running",
    toolCount: 4,
    cost: Number.NaN,
    recentOutput: ["one", 2, "three"],
    modelOverride: ["m1", "m2"],
    retryState: { attempt: 1, maxAttempts: 3, delayMs: 10, errorMessage: "boom", startedAtMs: 1 },
    retryFailure: { attempt: 1 },
    unknownField: true,
  });
  assert.equal(parsed.id, "a");
  assert.equal(parsed.index, 3);
  assert.equal(parsed.status, "running");
  assert.equal(parsed.toolCount, 4);
  assert.equal(parsed.cost, undefined);
  assert.deepEqual(parsed.recentOutput, ["one", "three"]);
  assert.deepEqual(parsed.modelOverride, ["m1", "m2"]);
  assert.deepEqual(parsed.retryState, { attempt: 1, maxAttempts: 3, delayMs: 10, errorMessage: "boom", startedAtMs: 1 });
  // Partial retryFailure / retryState would render a false retrying state.
  assert.equal(parsed.retryFailure, undefined);
  assert.equal(parsed.unknownField, undefined);
  assert.equal(parseSubagentProgress({ status: "bogus" }), null);
});

test("parseSubagentActivityEvent derives tool, text and notice entries", () => {
  assert.equal(parseSubagentActivityEvent(null), null);
  assert.equal(parseSubagentActivityEvent({}), null);
  assert.equal(parseSubagentActivityEvent({ event: { type: "message_start" } }), null);

  assert.deepEqual(
    parseSubagentActivityEvent({ event: { type: "tool_execution_start", toolName: "read", intent: " scanning " } }, 10),
    { kind: "tool", label: "→ read — scanning", ts: 10 },
  );
  assert.deepEqual(
    parseSubagentActivityEvent({ event: { type: "tool_execution_start", toolName: "grep", args: { pattern: "x", path: "y", z: 1, w: 2 } } }, 11),
    { kind: "tool", label: "→ grep (pattern, path, z)", ts: 11 },
  );
  assert.deepEqual(
    parseSubagentActivityEvent({ event: { type: "tool_execution_start" } }, 12),
    { kind: "tool", label: "→ tool", ts: 12 },
  );
  assert.deepEqual(
    parseSubagentActivityEvent(
      { event: { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: " hello " }, { type: "text", text: "world" }] } } },
      13,
    ),
    { kind: "text", label: "hello \nworld", ts: 13 },
  );
  assert.equal(parseSubagentActivityEvent({ event: { type: "message_end", message: { role: "user", content: "hi" } } }), null);
  assert.deepEqual(
    parseSubagentActivityEvent({ event: { type: "notice", message: "a".repeat(200) } }, 14),
    { kind: "notice", label: "a".repeat(140), ts: 14 },
  );
});

// ---------------------------------------------------------------------------
// Roster merge

test("mergeRoster appends new entries and orders them", () => {
  const next = mergeRoster([], [
    live("z", { index: 2, batchSeq: 1 }),
    live("a", { index: 1, batchSeq: 1 }),
    live("m", { index: 0 }),
    live("b", { index: 0, batchSeq: 2 }),
  ]);
  assert.deepEqual(next.map((s) => s.id), ["a", "z", "b", "m"]);
  assert.deepEqual(next.map((s) => s.index), [1, 2, 0, 0]);
});

test("mergeRoster keeps live over history and lets live overwrite history", () => {
  const fromHistory = mergeRoster(
    [history("a", { status: "completed", batchSeq: 0 })],
    [live("a", { status: "started", lastUpdate: 5 })],
  );
  assert.equal(fromHistory.length, 1);
  assert.equal(fromHistory[0].status, "started");
  assert.equal(fromHistory[0].source, "live");
  // batchSeq survives the precedence flip.
  assert.equal(fromHistory[0].batchSeq, 0);

  const historyCannotOverwrite = mergeRoster(
    [live("a", { status: "started", batchSeq: 0, lastUpdate: 10 })],
    [history("a", { status: "completed", batchSeq: 0 })],
  );
  assert.equal(historyCannotOverwrite[0].status, "started");
  assert.equal(historyCannotOverwrite[0].source, "live");
  assert.equal(historyCannotOverwrite.length, 1);
});

test("mergeRoster overlays same-source entries", () => {
  const next = mergeRoster(
    [live("a", { status: "started", task: "old", lastUpdate: 1 })],
    [live("a", { status: "completed", task: "new", lastUpdate: 2 })],
  );
  assert.equal(next[0].status, "completed");
  assert.equal(next[0].task, "new");
  assert.equal(next[0].lastUpdate, 2);
});

test("mergeRoster refuses entries updated at or after skipNewerThan but keeps batchSeq", () => {
  const refused = mergeRoster(
    [live("a", { status: "completed", lastUpdate: 500, batchSeq: undefined })],
    [history("a", { status: "failed", lastUpdate: 1, batchSeq: 3 })],
    500,
  );
  assert.equal(refused[0].status, "completed");
  assert.equal(refused[0].batchSeq, 3);

  const allowed = mergeRoster(
    [history("a", { status: "completed", lastUpdate: 499 })],
    [live("a", { status: "started", lastUpdate: 10 })],
    500,
  );
  assert.equal(allowed[0].status, "started");
});

test("compareSubagents orders by batchSeq, index, then id", () => {
  const sorted = [live("b", { batchSeq: 1, index: 0 }), live("a", { batchSeq: 1, index: 0 }), live("c", { batchSeq: 0, index: 5 })]
    .sort(compareSubagents);
  assert.deepEqual(sorted.map((s) => s.id), ["c", "a", "b"]);
  assert.equal(compareSubagents(live("a"), live("a")), 0);
});

// ---------------------------------------------------------------------------
// Anti-drift: core mergeRoster ≡ lib mergeSubagentRoster

test("mergeRoster matches the lib fold across a fixture matrix", () => {
  const cases = [
    {
      name: "new entries appended",
      prev: [],
      incoming: [live("a", { index: 0 }), live("b", { index: 1, batchSeq: 0 })],
    },
    {
      name: "live overwrites history",
      prev: [history("a", { status: "completed", batchSeq: 0 })],
      incoming: [live("a", { status: "started", lastUpdate: 5 })],
    },
    {
      name: "history does not overwrite live",
      prev: [live("a", { status: "started", batchSeq: 0, lastUpdate: 10 })],
      incoming: [history("a", { status: "completed", batchSeq: 0 })],
    },
    {
      name: "skipNewerThan refuses history",
      prev: [live("a", { status: "completed", lastUpdate: 900 })],
      incoming: [history("a", { status: "failed", lastUpdate: 1, batchSeq: 3 })],
      skipNewerThan: 500,
    },
    {
      name: "skipNewerThan refuses a live frame too",
      prev: [live("a", { status: "completed", lastUpdate: 900, batchSeq: 2 })],
      incoming: [live("a", { status: "started", lastUpdate: 901 })],
      skipNewerThan: 500,
    },
    {
      name: "same-source overlay carries batchSeq",
      prev: [live("a", { task: "old", batchSeq: 4, lastUpdate: 1 })],
      incoming: [live("a", { task: "new", lastUpdate: 2 })],
    },
    {
      name: "history overwrites history",
      prev: [history("a", { status: "started", task: "old" })],
      incoming: [history("a", { status: "completed", task: "new" })],
    },
    {
      name: "ordering across batches and indexes",
      prev: [live("old", { index: 9, batchSeq: 7 })],
      incoming: [
        live("z", { index: 2, batchSeq: 1 }),
        live("a", { index: 1, batchSeq: 1 }),
        live("m", { index: 0 }),
        history("b", { index: 0, batchSeq: 2 }),
      ],
    },
    {
      name: "duplicate ids inside one incoming batch keep last-wins",
      prev: [],
      incoming: [live("a", { status: "started" }), history("a", { status: "completed", batchSeq: 1 })],
    },
  ];

  for (const fixture of cases) {
    const prev = structuredClone(fixture.prev);
    const incoming = structuredClone(fixture.incoming);
    const actual = mergeRoster(prev, incoming, fixture.skipNewerThan);
    const expected = mergeSubagentRoster(
      structuredClone(fixture.prev),
      structuredClone(fixture.incoming),
      fixture.skipNewerThan,
    );
    const shape = (roster) => roster.map(({ id, status, source, batchSeq }) => ({ id, status, source, batchSeq }));
    assert.deepEqual(shape(actual), shape(expected), `ids/statuses drifted: ${fixture.name}`);
    assert.deepEqual(actual, expected, `full entry drifted: ${fixture.name}`);
    // The fold must not mutate its inputs.
    assert.deepEqual(prev, fixture.prev, `prev mutated: ${fixture.name}`);
    assert.deepEqual(incoming, fixture.incoming, `incoming mutated: ${fixture.name}`);
  }
});

// ---------------------------------------------------------------------------
// Reducer

const NOW = 1000;

test("reduceSubagents merges lifecycle frames and ignores malformed ones", () => {
  const started = reduceSubagents(EMPTY_SUBAGENTS, {
    type: "subagent_lifecycle",
    payload: { id: "a", agent: "explorer", status: "started", index: 0 },
  }, NOW);
  assert.equal(started.roster.length, 1);
  assert.equal(started.roster[0].status, "started");
  assert.equal(started.roster[0].lastUpdate, NOW);
  assert.equal(activeSubagentCount(started), 1);

  const completed = reduceSubagents(started, {
    type: "subagent_lifecycle",
    payload: { id: "a", status: "completed" },
  }, NOW + 1);
  assert.equal(completed.roster.length, 1);
  assert.equal(completed.roster[0].status, "completed");
  // The wire may omit `agent`; lifecycle parsing defaults it (upstream parity).
  assert.equal(completed.roster[0].agent, "subagent");
  assert.equal(activeSubagentCount(completed), 0);

  const renamed = reduceSubagents(started, {
    type: "subagent_lifecycle",
    payload: { id: "a", agent: "explorer", status: "failed" },
  }, NOW + 1);
  assert.equal(renamed.roster[0].agent, "explorer");

  for (const payload of [undefined, null, {}, { id: "a" }, { status: "started" }, { id: "a", status: "nope" }, "junk"]) {
    assert.equal(reduceSubagents(started, { type: "subagent_lifecycle", payload }, NOW), started);
  }
  assert.equal(reduceSubagents(started, { type: "unrelated", payload: {} }, NOW), started);
});

test("progress merges by progress.id into an existing chip", () => {
  const base = reduceSubagents(EMPTY_SUBAGENTS, {
    type: "subagent_lifecycle",
    payload: { id: "a", agent: "explorer", status: "started" },
  }, NOW);
  const next = reduceSubagents(base, {
    type: "subagent_progress",
    payload: {
      progress: { id: "a", status: "running", toolCount: 3, currentTool: "read" },
      agent: "explorer-2",
      agentSource: "project",
      task: "find it",
      sessionFile: "/tmp/a.jsonl",
      detached: true,
    },
  }, NOW + 5);
  assert.equal(next.roster.length, 1);
  const [entry] = next.roster;
  assert.equal(entry.id, "a");
  assert.equal(entry.agent, "explorer-2");
  assert.equal(entry.agentSource, "project");
  assert.equal(entry.task, "find it");
  assert.equal(entry.sessionFile, "/tmp/a.jsonl");
  assert.equal(entry.detached, true);
  assert.equal(entry.lastUpdate, NOW + 5);
  assert.equal(entry.progress.toolCount, 3);
  assert.equal(entry.progress.status, "running");
});

test("progress never invents a chip and treats a missing progress.id as stale", () => {
  const base = reduceSubagents(EMPTY_SUBAGENTS, {
    type: "subagent_lifecycle",
    payload: { id: "a", status: "started", parentToolCallId: "call-1", index: 0 },
  }, NOW);
  assert.equal(
    reduceSubagents(base, { type: "subagent_progress", payload: { progress: { id: "ghost", toolCount: 1 } } }, NOW),
    base,
  );
  // A frame naming an id that is gone must not fall back onto another child.
  const named = reduceSubagents(base, {
    type: "subagent_progress",
    payload: { progress: { id: "ghost" }, parentToolCallId: "call-1", index: 0 },
  }, NOW);
  assert.equal(named, base);
  assert.equal(reduceSubagents(EMPTY_SUBAGENTS, {
    type: "subagent_progress",
    payload: { progress: { id: "a" } },
  }, NOW), EMPTY_SUBAGENTS);
});

test("id-less progress matches by parentToolCallId, then index", () => {
  let state = reduceSubagents(EMPTY_SUBAGENTS, {
    type: "subagent_lifecycle",
    payload: { id: "a", status: "started", parentToolCallId: "call-1", index: 0 },
  }, NOW);
  state = reduceSubagents(state, {
    type: "subagent_lifecycle",
    payload: { id: "b", status: "started", parentToolCallId: "call-1", index: 1 },
  }, NOW);

  const byPair = reduceSubagents(state, {
    type: "subagent_progress",
    payload: { parentToolCallId: "call-1", index: 1, progress: { toolCount: 7 } },
  }, NOW + 1);
  assert.equal(byPair.roster.find((s) => s.id === "b").progress.toolCount, 7);
  assert.equal(byPair.roster.find((s) => s.id === "a").progress, undefined);

  const byParent = reduceSubagents(state, {
    type: "subagent_progress",
    payload: { parentToolCallId: "call-1", progress: { toolCount: 2 } },
  }, NOW + 1);
  assert.equal(byParent.roster.find((s) => s.id === "a").progress.toolCount, 2);

  const byIndex = reduceSubagents(state, {
    type: "subagent_progress",
    payload: { progress: { index: 1, toolCount: 9 } },
  }, NOW + 1);
  assert.equal(byIndex.roster.find((s) => s.id === "b").progress.toolCount, 9);

  // Nothing matches → unchanged state object.
  assert.equal(reduceSubagents(state, {
    type: "subagent_progress",
    payload: { index: 5, progress: { toolCount: 1 } },
  }, NOW), state);
});

test("subagent_event bumps the transcript version and caps activity at 50", () => {
  let state = EMPTY_SUBAGENTS;
  for (let index = 0; index < 60; index += 1) {
    state = reduceSubagents(state, {
      type: "subagent_event",
      payload: { id: "a", event: { type: "notice", message: `m${index}` } },
    }, NOW + index);
  }
  assert.equal(state.transcriptVersions.a, 60);
  assert.equal(state.activity.a.length, 50);
  assert.equal(state.activity.a[0].label, "m10");
  assert.equal(state.activity.a[49].label, "m59");
  assert.equal(state.activity.a[49].ts, NOW + 59);
  // Event frames still land when the payload's event is unparseable.
  const bumped = reduceSubagents(state, { type: "subagent_event", payload: { id: "a", event: { type: "other" } } }, NOW);
  assert.equal(bumped.transcriptVersions.a, 61);
  assert.equal(bumped.activity.a.length, 50);
  assert.equal(reduceSubagents(state, { type: "subagent_event", payload: {} }, NOW), state);
  assert.equal(reduceSubagents(state, { type: "subagent_event", payload: { id: 3 } }, NOW), state);
});

test("id-keyed maps prune to 64 and keep the newest ids", () => {
  let state = EMPTY_SUBAGENTS;
  for (let index = 0; index < 70; index += 1) {
    state = reduceSubagents(state, {
      type: "subagent_event",
      payload: { id: `s${index}`, event: { type: "notice", message: "tick" } },
    }, NOW);
  }
  assert.equal(Object.keys(state.activity).length, 64);
  assert.equal(Object.keys(state.transcriptVersions).length, 64);
  assert.equal(state.activity.s69.length, 1);
  assert.equal(state.transcriptVersions.s69, 1);
  assert.equal("s0" in state.activity, false);
  assert.equal("s0" in state.transcriptVersions, false);
});

test("activeSubagentCount counts started entries; reset drops everything", () => {
  let state = reduceSubagents(EMPTY_SUBAGENTS, {
    type: "subagent_lifecycle",
    payload: { id: "a", status: "started" },
  }, NOW);
  state = reduceSubagents(state, { type: "subagent_lifecycle", payload: { id: "b", status: "failed" } }, NOW);
  state = reduceSubagents(state, { type: "subagent_lifecycle", payload: { id: "c", status: "started" } }, NOW);
  assert.equal(activeSubagentCount(state), 2);
  assert.equal(activeSubagentCount(EMPTY_SUBAGENTS), 0);
  assert.equal(resetSubagents(state), EMPTY_SUBAGENTS);
  assert.deepEqual(EMPTY_SUBAGENTS.roster, []);
});

// ---------------------------------------------------------------------------
// Purity

test("the fold never mutates a deep-frozen state or payload", () => {
  const base = reduceSubagents(EMPTY_SUBAGENTS, {
    type: "subagent_lifecycle",
    payload: { id: "a", status: "started", index: 0, parentToolCallId: "call-1" },
  }, NOW);
  const frozen = deepFreeze(structuredClone(base));
  const before = structuredClone(frozen);

  const lifecyclePayload = deepFreeze({ id: "b", status: "started", index: 1 });
  const progressPayload = deepFreeze({
    progress: { id: "a", toolCount: 2, recentOutput: ["x"] },
    parentToolCallId: "call-1",
  });
  const eventPayload = deepFreeze({ id: "a", event: { type: "notice", message: "hi" } });

  let next = reduceSubagents(frozen, { type: "subagent_lifecycle", payload: lifecyclePayload }, NOW + 1);
  next = reduceSubagents(next, { type: "subagent_progress", payload: progressPayload }, NOW + 2);
  next = reduceSubagents(next, { type: "subagent_event", payload: eventPayload }, NOW + 3);

  assert.equal(frozen.roster.length, 1);
  assert.equal(frozen.roster[0].progress, undefined);
  assert.deepEqual(frozen, before);
  assert.equal(next.roster.length, 2);
  // Untouched sub-state keeps its identity across the fold.
  assert.equal(next.transcriptVersions.a, 1);

  const frozenRoster = deepFreeze(reduceSubagents(EMPTY_SUBAGENTS, {
    type: "subagent_lifecycle",
    payload: { id: "a", status: "started" },
  }, NOW).roster);
  assert.doesNotThrow(() => mergeRoster(frozenRoster, [live("a", { status: "completed" })]));
  assert.equal(frozenRoster[0].status, "started");
});
