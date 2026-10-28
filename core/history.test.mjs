import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  reconcilePage,
  planLiveMerge,
  advanceFloors,
  emptyFloors,
  classifyEvent,
} = await jiti.import("./history");

const user = (text) => ({ role: "user", content: text });
const assistant = (text) => ({ role: "assistant", content: [{ type: "text", text }] });
const cursor = (first, last) => ({ firstEntryId: first, lastEntryId: last });

function page(overrides = {}) {
  return {
    mode: "append",
    baseEntryId: null,
    context: { messages: [], entryIds: [] },
    cursor: cursor(null, null),
    hasMore: false,
    ...overrides,
  };
}

function view(messages, entryIds, position) {
  return { messages, entryIds, cursor: position };
}

test("append merges onto the view and skips entry ids it already holds", () => {
  const previous = view([user("a"), assistant("b")], ["e1", "e2"], cursor("e1", "e2"));
  const result = reconcilePage(previous, page({
    baseEntryId: "e2",
    context: { messages: [user("a"), assistant("c")], entryIds: ["e1", "e3"] },
    cursor: cursor("e1", "e3"),
  }));

  assert.equal(result.ok, true);
  assert.deepEqual(result.view.entryIds, ["e1", "e2", "e3"]);
  assert.equal(result.view.messages.length, 3);
  assert.equal(result.view.messages[2].content[0].text, "c");
  assert.deepEqual(result.view.cursor, cursor("e1", "e3"));
});

test("append onto a foreign cursor is rejected rather than spliced", () => {
  const previous = view([user("a")], ["e1"], cursor("e1", "e1"));
  const result = reconcilePage(previous, page({
    baseEntryId: "e9",
    context: { messages: [user("b")], entryIds: ["e2"] },
    cursor: cursor("e2", "e2"),
  }));
  assert.deepEqual(result, { ok: false, reason: "base_mismatch" });
});

test("replace drops the previous view even when the cursor is disjoint", () => {
  const previous = view([user("a")], ["e1"], cursor("e1", "e1"));
  const result = reconcilePage(previous, page({
    mode: "replace",
    baseEntryId: "e9",
    context: { messages: [user("rewritten")], entryIds: ["e7"] },
    cursor: cursor("e7", "e7"),
  }));

  assert.equal(result.ok, true);
  assert.deepEqual(result.view.entryIds, ["e7"]);
  assert.equal(result.view.messages.length, 1);
});

test("a page whose messages and entry ids disagree is rejected", () => {
  const result = reconcilePage(null, page({
    context: { messages: [user("a")], entryIds: ["e1", "e2"] },
  }));
  assert.deepEqual(result, { ok: false, reason: "length_mismatch" });
});

test("an unknown page mode is rejected", () => {
  const result = reconcilePage(null, page({ mode: "merge" }));
  assert.deepEqual(result, { ok: false, reason: "invalid_mode" });
});

test("paging continues only while the cursor advances", () => {
  const first = reconcilePage(null, page({
    context: { messages: [user("a")], entryIds: ["e1"] },
    cursor: cursor("e1", "e1"),
    hasMore: true,
  }));
  assert.equal(first.next, "more");

  const stalled = reconcilePage(first.view, page({
    baseEntryId: "e1",
    cursor: cursor("e1", "e1"),
    hasMore: true,
  }));
  assert.equal(stalled.next, "stalled", "a non-advancing page must not loop forever");

  const done = reconcilePage(first.view, page({ baseEntryId: "e1", hasMore: false }));
  assert.equal(done.next, "done");
});

test("a live snapshot older than applied frames does not overwrite them", () => {
  const floors = { ...emptyFloors(), message: 40, lifecycle: 45, latestTool: 30 };
  const plan = planLiveMerge(floors, 45, {
    cursor: { streamId: "s1", sequence: 20 },
    isStreaming: false,
    isPromptRunning: false,
    isCompacting: false,
    streamingMessage: null,
    toolEvents: [],
  });
  assert.equal(plan.fields.message, false);
  assert.equal(plan.fields.lifecycle, false);
  assert.equal(plan.streamSequence, 45);
});

test("a live snapshot newer than every floor is accepted", () => {
  const floors = { ...emptyFloors(), message: 10, lifecycle: 12 };
  const plan = planLiveMerge(floors, 12, {
    cursor: { streamId: "s1", sequence: 30 },
    isStreaming: true,
    isPromptRunning: true,
    isCompacting: false,
    streamingMessage: null,
    toolEvents: [],
  });
  assert.deepEqual(plan.fields, { message: true, lifecycle: true, tools: new Set() });
  assert.equal(plan.floors.message, 30);
  assert.equal(plan.floors.lifecycle, 30);
  assert.equal(plan.streamSequence, 30);
});

test("a fresh snapshot keeps the per-call results newer than itself", () => {
  const tools = new Map([["old", 5], ["new", 50]]);
  const plan = planLiveMerge(
    { ...emptyFloors(), toolsSnapshot: 20, lifecycle: 20, tools, latestTool: 50 },
    50,
    {
      cursor: { streamId: "s1", sequence: 30 },
      isStreaming: false,
      isPromptRunning: false,
      isCompacting: false,
      streamingMessage: null,
      toolEvents: [],
    },
  );
  assert.deepEqual([...plan.fields.tools], ["new"]);
  assert.deepEqual([...plan.floors.tools.keys()], ["new"]);
  assert.equal(plan.floors.toolsSnapshot, 30);
});

test("a snapshot older than the tool floor rejects tool hydration entirely", () => {
  const floors = { ...emptyFloors(), toolsSnapshot: 40, lifecycle: 40, tools: new Map([["call-1", 5]]), latestTool: 5 };
  const plan = planLiveMerge(floors, 40, {
    cursor: { streamId: "s1", sequence: 30 },
    isStreaming: false,
    isPromptRunning: false,
    isCompacting: false,
    streamingMessage: null,
    toolEvents: [],
  });
  assert.equal(plan.fields.tools, null);
  assert.deepEqual([...plan.floors.tools.keys()], ["call-1"], "existing floors are preserved");
});

test("frames below their family floor are stale", () => {
  const floors = { ...emptyFloors(), lifecycle: 5, message: 10, latestTool: 8 };
  const staleMessage = advanceFloors(floors, 10, { type: "message_update" }, 9);
  assert.equal(staleMessage.stale, true);

  const freshMessage = advanceFloors(floors, 10, { type: "message_update" }, 11);
  assert.equal(freshMessage.stale, false);
  assert.equal(freshMessage.floors.message, 11);

  const staleLifecycle = advanceFloors(floors, 10, { type: "agent_end" }, 9);
  assert.equal(staleLifecycle.stale, true, "lifecycle is gated by the newest of every family");
});

test("a lifecycle frame resets per-tool floors", () => {
  const floors = { ...emptyFloors(), tools: new Map([["call-1", 3]]), latestTool: 3 };
  const advance = advanceFloors(floors, 3, { type: "agent_start" }, 4);
  assert.equal(advance.floors.tools.size, 0);
  assert.equal(advance.floors.lifecycle, 4);
});

test("tool frames carry their own per-call floor", () => {
  const floors = { ...emptyFloors(), tools: new Map([["call-1", 7]]) };
  assert.equal(advanceFloors(floors, 7, { type: "tool_execution_update", toolCallId: "call-1" }, 6).stale, true);
  assert.equal(advanceFloors(floors, 7, { type: "tool_execution_update", toolCallId: "call-2" }, 6).stale, false);
});

test("user messages are never treated as assistant streaming", () => {
  assert.equal(classifyEvent({ type: "message_update", message: { role: "user" } }).family, "other");
  assert.equal(classifyEvent({ type: "message_update", message: { role: "assistant" } }).family, "message");
  assert.equal(classifyEvent({ type: "agent_end" }).family, "lifecycle");
  assert.equal(classifyEvent({ type: "tool_execution_start", toolCallId: "x" }).family, "tool");
});
