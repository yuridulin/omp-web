import assert from "node:assert/strict";
import { test } from "bun:test";

const {
  parseTodoPhases,
  todoPhasesFromEntries,
  currentTodoPhase,
  todoProgress,
} = await import("./todos.ts");

const phase = (name, tasks) => ({ name, tasks });
const task = (content, status, blocker) => (blocker === undefined ? { content, status } : { content, status, blocker });

const custom = (id, parentId, phases) => ({
  id,
  parentId,
  type: "custom",
  customType: "user_todo_edit",
  data: { phases },
});
const toolResult = (id, parentId, phases, extra = {}) => ({
  id,
  parentId,
  type: "message",
  message: { role: "toolResult", toolName: "todo", details: { phases }, ...extra },
});

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Object.keys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

test("parses a well-formed phase list and copies only known fields", () => {
  const parsed = parseTodoPhases([
    { id: "phase-1", name: "Plan", tasks: [{ id: "a", content: "draft", status: "completed" }] },
    phase("Build", [
      task("write", "in_progress"),
      task("blocked one", "blocked", "needs review"),
      task("dropped", "abandoned"),
      task("later", "pending"),
    ]),
  ]);
  assert.deepEqual(parsed, [
    { name: "Plan", tasks: [{ content: "draft", status: "completed" }] },
    {
      name: "Build",
      tasks: [
        { content: "write", status: "in_progress" },
        { content: "blocked one", status: "blocked", blocker: "needs review" },
        { content: "dropped", status: "abandoned" },
        { content: "later", status: "pending" },
      ],
    },
  ]);
});

test("empty payload is a valid empty list", () => {
  assert.deepEqual(parseTodoPhases([]), []);
  assert.deepEqual(parseTodoPhases([phase("Empty", [])]), [{ name: "Empty", tasks: [] }]);
});

test("rejects non-arrays", () => {
  for (const raw of [null, undefined, "[]", 42, {}, { phases: [] }]) {
    assert.equal(parseTodoPhases(raw), null);
  }
});

test("rejects any phase with a bad name or tasks list", () => {
  const valid = phase("ok", []);
  assert.equal(parseTodoPhases([phase(undefined, [])]), null);
  assert.equal(parseTodoPhases([{ name: 7, tasks: [] }]), null);
  assert.equal(parseTodoPhases([{ name: "x" }]), null);
  assert.equal(parseTodoPhases([{ name: "x", tasks: {} }]), null);
  assert.equal(parseTodoPhases([valid, null]), null);
  assert.equal(parseTodoPhases([valid, "phase"]), null);
});

test("rejects any task with bad content, status or blocker, failing the whole payload", () => {
  assert.equal(parseTodoPhases([phase("x", [{ status: "pending" }])]), null);
  assert.equal(parseTodoPhases([phase("x", [{ content: 1, status: "pending" }])]), null);
  assert.equal(parseTodoPhases([phase("x", [task("a", "done")])]), null);
  assert.equal(parseTodoPhases([phase("x", [{ content: "a", status: "PENDING" }])]), null);
  assert.equal(parseTodoPhases([phase("x", [{ content: "a", status: 1 }])]), null);
  assert.equal(parseTodoPhases([phase("x", [task("a", "pending", 3)])]), null);
  assert.equal(parseTodoPhases([phase("x", [task("a", "pending"), null])]), null);
  // A malformed later task must not leave the earlier ones visible.
  assert.equal(parseTodoPhases([phase("x", [task("ok", "pending"), task("bad", "nope")])]), null);
});

test("an explicit undefined blocker is allowed and dropped", () => {
  assert.deepEqual(parseTodoPhases([phase("x", [task("a", "pending", undefined)])]), [
    { name: "x", tasks: [{ content: "a", status: "pending" }] },
  ]);
});

// ---------------------------------------------------------------------------
// Branch walk
// ---------------------------------------------------------------------------

test("nearest snapshot wins: custom over older tool result", () => {
  const entries = [
    toolResult("t", null, [phase("old", [])]),
    custom("c", "t", [phase("new", [])]),
  ];
  assert.deepEqual(todoPhasesFromEntries(entries, "c"), [phase("new", [])]);
});

test("nearest snapshot wins: tool result over older custom entry", () => {
  const entries = [
    custom("c", null, [phase("old", [])]),
    toolResult("t", "c", [phase("new", [])]),
  ];
  assert.deepEqual(todoPhasesFromEntries(entries, "t"), [phase("new", [])]);
});

test("nearest snapshot wins among entries of the same kind", () => {
  const entries = [
    custom("a", null, [phase("oldest", [])]),
    custom("b", "a", [phase("middle", [])]),
    custom("c", "b", [phase("newest", [])]),
  ];
  assert.deepEqual(todoPhasesFromEntries(entries, "c"), [phase("newest", [])]);
  assert.deepEqual(todoPhasesFromEntries(entries, "b"), [phase("middle", [])]);
});

test("walks past entries without a snapshot to the parent that has one", () => {
  const entries = [
    custom("root", null, [phase("root phase", [])]),
    { id: "message", parentId: "root", type: "message", message: { role: "user", content: "hi" } },
    { id: "leaf", parentId: "message", type: "message", message: { role: "assistant", content: [] } },
  ];
  assert.deepEqual(todoPhasesFromEntries(entries, "leaf"), [phase("root phase", [])]);
});

test("undefined leaf starts at the last entry, not the root", () => {
  const entries = [custom("a", null, [phase("root", [])]), custom("b", "a", [phase("tip", [])])];
  assert.deepEqual(todoPhasesFromEntries(entries), [phase("tip", [])]);
});

test("unknown leaf id yields no snapshot", () => {
  const entries = [custom("a", null, [phase("root", [])])];
  assert.deepEqual(todoPhasesFromEntries(entries, "missing"), []);
  assert.deepEqual(todoPhasesFromEntries(entries, ""), []);
});

test("null leaf and empty entries yield an empty list", () => {
  assert.deepEqual(todoPhasesFromEntries([custom("a", null, [phase("root", [])])], null), []);
  assert.deepEqual(todoPhasesFromEntries([], undefined), []);
  assert.deepEqual(todoPhasesFromEntries([], null), []);
  assert.deepEqual(todoPhasesFromEntries([], "a"), []);
});

test("a parentId cycle terminates and still finds a snapshot", () => {
  const cyclic = [
    { id: "a", parentId: "b", type: "message", message: { role: "user", content: "x" } },
    custom("b", "a", [phase("in cycle", [])]),
  ];
  assert.deepEqual(todoPhasesFromEntries(cyclic, "a"), [phase("in cycle", [])]);
  const dangling = [
    { id: "a", parentId: "a", type: "message", message: { role: "user", content: "x" } },
    { id: "b", parentId: "a", type: "message", message: { role: "user", content: "y" } },
  ];
  assert.deepEqual(todoPhasesFromEntries(dangling, "a"), []);
});

test("malformed snapshots are skipped rather than thrown", () => {
  const entries = [
    custom("good", null, [phase("good", [])]),
    { id: "bad-custom", parentId: "good", type: "custom", customType: "user_todo_edit", data: { phases: "nope" } },
    { id: "no-data", parentId: "bad-custom", type: "custom", customType: "user_todo_edit" },
    { id: "bad-details", parentId: "no-data", type: "message", message: { role: "toolResult", toolName: "todo", details: null } },
    {
      id: "bad-phases",
      parentId: "bad-details",
      type: "message",
      message: { role: "toolResult", toolName: "todo", details: { phases: [{ name: 3, tasks: [] }] }, isError: false },
    },
    { id: "no-message", parentId: "bad-phases", type: "message" },
  ];
  assert.deepEqual(todoPhasesFromEntries(entries, "no-message"), [phase("good", [])]);
});

test("failing tool results and unrelated tools are ignored", () => {
  const entries = [
    custom("good", null, [phase("good", [])]),
    toolResult("failed", "good", [phase("errored", [])], { isError: true }),
    {
      id: "other-tool",
      parentId: "failed",
      type: "message",
      message: { role: "toolResult", toolName: "read", details: { phases: [phase("other", [])] } },
    },
    {
      id: "assistant",
      parentId: "other-tool",
      type: "message",
      message: { role: "assistant", toolName: "todo", details: { phases: [phase("assistant", [])] } },
    },
  ];
  assert.deepEqual(todoPhasesFromEntries(entries, "assistant"), [phase("good", [])]);
});

test("a valid empty snapshot is still a snapshot", () => {
  const entries = [custom("a", null, [phase("old", [])]), custom("b", "a", [])];
  assert.deepEqual(todoPhasesFromEntries(entries, "b"), []);
  assert.deepEqual(todoPhasesFromEntries([custom("a", null, [])], "a"), []);
});

test("custom entries of another customType are not todo snapshots", () => {
  const entries = [
    custom("a", null, [phase("todo", [])]),
    { id: "b", parentId: "a", type: "custom", customType: "omp:goal", data: { phases: [phase("goal", [])] } },
  ];
  assert.deepEqual(todoPhasesFromEntries(entries, "b"), [phase("todo", [])]);
});

// ---------------------------------------------------------------------------
// Current phase
// ---------------------------------------------------------------------------

test("returns the first unfinished phase and counts work inside it", () => {
  const phases = [
    phase("Done", [task("a", "completed"), task("b", "completed")]),
    phase("Active", [task("c", "completed"), task("d", "in_progress"), task("e", "pending")]),
    phase("Later", [task("f", "pending")]),
  ];
  assert.deepEqual(currentTodoPhase(phases), {
    name: "Active",
    index: 2,
    phaseCount: 3,
    done: 1,
    total: 3,
  });
});

test("index math skips completed phases", () => {
  const phases = [
    phase("one", [task("a", "completed")]),
    phase("two", []),
    phase("three", [task("b", "pending")]),
  ];
  assert.deepEqual(currentTodoPhase(phases), {
    name: "three",
    index: 3,
    phaseCount: 3,
    done: 0,
    total: 1,
  });
});

test("only pending or in-progress work makes a phase current", () => {
  const phases = [phase("Blocked", [task("a", "blocked", "waiting"), task("b", "abandoned")])];
  assert.equal(currentTodoPhase(phases), null, "blocked and abandoned tasks are not current work");
});

test("pending work later in the list outranks an earlier blocked-only phase", () => {
  const phases = [
    phase("Blocked", [task("a", "blocked", "waiting")]),
    phase("Moving", [task("b", "pending")]),
  ];
  assert.deepEqual(currentTodoPhase(phases), {
    name: "Moving",
    index: 2,
    phaseCount: 2,
    done: 0,
    total: 1,
  });
});

test("null when every phase is complete or empty, or there are no phases", () => {
  assert.equal(
    currentTodoPhase([phase("a", [task("x", "completed")]), phase("b", [])]),
    null,
  );
  assert.equal(currentTodoPhase([]), null);
});

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

test("progress sums completed tasks across phases", () => {
  const phases = [
    phase("a", [task("1", "completed"), task("2", "completed")]),
    phase("b", [task("3", "completed"), task("4", "pending")]),
  ];
  assert.deepEqual(todoProgress(phases), { done: 3, total: 4, percent: 75 });
  assert.deepEqual(todoProgress([phase("a", [task("1", "completed")])]), {
    done: 1,
    total: 1,
    percent: 100,
  });
});

test("progress rounds to one decimal", () => {
  assert.equal(todoProgress([phase("a", [task("1", "completed"), task("2", "pending"), task("3", "pending")])]).percent, 33.3);
  const twoOfThree = todoProgress([
    phase("a", [task("1", "completed"), task("2", "completed")]),
    phase("b", [task("3", "blocked")]),
  ]);
  assert.deepEqual(twoOfThree, { done: 2, total: 3, percent: 66.7 });
  assert.deepEqual(todoProgress([phase("a", Array.from({ length: 8 }, (_, i) => task(String(i), i === 0 ? "completed" : "pending")))]), {
    done: 1,
    total: 8,
    percent: 12.5,
  });
});

test("progress with nothing to do reports a null percentage", () => {
  assert.deepEqual(todoProgress([]), { done: 0, total: 0, percent: null });
  assert.deepEqual(todoProgress([phase("a", [])]), { done: 0, total: 0, percent: null });
  assert.deepEqual(todoProgress([phase("a", [task("x", "abandoned")])]), {
    done: 0,
    total: 1,
    percent: 0,
  });
});

// ---------------------------------------------------------------------------
// Purity
// ---------------------------------------------------------------------------

test("parsing and summarising frozen inputs neither mutates nor aliases them", () => {
  const raw = deepFreeze([
    phase("a", [task("1", "completed"), task("2", "pending"), task("3", "blocked", "why")]),
  ]);
  const parsed = parseTodoPhases(raw);
  assert.deepEqual(parsed, [
    { name: "a", tasks: [task("1", "completed"), task("2", "pending"), task("3", "blocked", "why")] },
  ]);
  assert.notEqual(parsed[0], raw[0]);
  assert.notEqual(parsed[0].tasks[0], raw[0].tasks[0]);

  const frozenPhases = deepFreeze(parsed);
  assert.deepEqual(currentTodoPhase(frozenPhases), {
    name: "a",
    index: 1,
    phaseCount: 1,
    done: 1,
    total: 3,
  });
  assert.deepEqual(todoProgress(frozenPhases), { done: 1, total: 3, percent: 33.3 });
});

test("walking frozen entries does not mutate them", () => {
  const entries = deepFreeze([
    toolResult("t", null, [phase("old", [task("x", "pending")])]),
    custom("c", "t", [phase("new", [task("y", "completed")])]),
  ]);
  const before = structuredClone(entries);
  assert.deepEqual(todoPhasesFromEntries(entries, "c"), [phase("new", [task("y", "completed")])]);
  assert.deepEqual([...entries], before);
  assert.ok(Object.isFrozen(entries[1].data.phases[0].tasks[0]));
});
