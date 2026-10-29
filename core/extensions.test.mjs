import assert from "node:assert/strict";
import { test } from "bun:test";

const {
  EMPTY_EXTENSIONS,
  reduceExtensions,
  responseFor,
} = await import("./extensions.ts");

const dialog = (id, extra = {}) => ({ id, method: "confirm", title: `T${id}`, message: "m", ...extra });

function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

test("a new dialog replaces the open one and clears answeredId", () => {
  const first = reduceExtensions(EMPTY_EXTENSIONS, { type: "dialog", dialog: dialog("a") });
  const answered = reduceExtensions(first, { type: "answered", id: "a" });
  assert.equal(answered.answeredId, "a");

  const next = reduceExtensions(answered, { type: "dialog", dialog: dialog("b") });
  assert.equal(next.dialog.id, "b");
  assert.equal(next.answeredId, null);
});

test("cancel only closes a matching open dialog", () => {
  const open = reduceExtensions(EMPTY_EXTENSIONS, { type: "dialog", dialog: dialog("a") });
  assert.equal(reduceExtensions(open, { type: "cancel", targetId: "b" }), open);
  assert.equal(reduceExtensions(open, { type: "cancel", targetId: "b" }).dialog.id, "a");

  const closed = reduceExtensions(open, { type: "cancel", targetId: "a" });
  assert.equal(closed.dialog, null);
});

test("cancel is ignored for the locally answered dialog", () => {
  let state = reduceExtensions(EMPTY_EXTENSIONS, { type: "dialog", dialog: dialog("a") });
  state = reduceExtensions(state, { type: "answered", id: "a" });
  const after = reduceExtensions(state, { type: "cancel", targetId: "a" });
  assert.equal(after, state);
  assert.equal(after.dialog.id, "a");
});

test("status upserts keep insertion position and remove on empty/null text", () => {
  let state = EMPTY_EXTENSIONS;
  state = reduceExtensions(state, { type: "status", key: "a", text: "one" });
  state = reduceExtensions(state, { type: "status", key: "b", text: "two" });
  state = reduceExtensions(state, { type: "status", key: "c", text: "three" });
  assert.deepEqual(state.statuses.map((item) => item.key), ["a", "b", "c"]);

  state = reduceExtensions(state, { type: "status", key: "b", text: "TWO" });
  assert.deepEqual(state.statuses, [
    { key: "a", text: "one" },
    { key: "b", text: "TWO" },
    { key: "c", text: "three" },
  ]);

  state = reduceExtensions(state, { type: "status", key: "a", text: null });
  assert.deepEqual(state.statuses.map((item) => item.key), ["b", "c"]);

  state = reduceExtensions(state, { type: "status", key: "c", text: "" });
  assert.deepEqual(state.statuses.map((item) => item.key), ["b"]);

  const unknown = reduceExtensions(state, { type: "status", key: "zz", text: null });
  assert.equal(unknown, state);
});

test("widget upserts keep position, default placement, and remove on null/empty lines", () => {
  let state = EMPTY_EXTENSIONS;
  state = reduceExtensions(state, { type: "widget", key: "w1", lines: ["a"] });
  state = reduceExtensions(state, { type: "widget", key: "w2", lines: ["b"], placement: "belowEditor" });
  assert.deepEqual(state.widgets, [
    { key: "w1", lines: ["a"], placement: "aboveEditor" },
    { key: "w2", lines: ["b"], placement: "belowEditor" },
  ]);

  state = reduceExtensions(state, { type: "widget", key: "w1", lines: ["A", "2"], placement: "belowEditor" });
  assert.deepEqual(state.widgets, [
    { key: "w1", lines: ["A", "2"], placement: "belowEditor" },
    { key: "w2", lines: ["b"], placement: "belowEditor" },
  ]);

  state = reduceExtensions(state, { type: "widget", key: "w2", lines: null });
  assert.deepEqual(state.widgets.map((item) => item.key), ["w1"]);

  state = reduceExtensions(state, { type: "widget", key: "w1", lines: [] });
  assert.deepEqual(state.widgets, []);
});

test("panel opens by replacement and closes only on id match", () => {
  let state = reduceExtensions(EMPTY_EXTENSIONS, { type: "panel-open", panel: { id: "p1", title: "P" } });
  assert.deepEqual(state.panel, { id: "p1", title: "P" });

  state = reduceExtensions(state, { type: "panel-open", panel: { id: "p2" } });
  assert.deepEqual(state.panel, { id: "p2" });

  assert.equal(reduceExtensions(state, { type: "panel-close", id: "p1" }), state);
  const closed = reduceExtensions(state, { type: "panel-close", id: "p2" });
  assert.equal(closed.panel, null);
});

test("reset returns the empty state", () => {
  let state = reduceExtensions(EMPTY_EXTENSIONS, { type: "dialog", dialog: dialog("a") });
  state = reduceExtensions(state, { type: "status", key: "k", text: "v" });
  const reset = reduceExtensions(state, { type: "reset" });
  assert.deepEqual(reset, EMPTY_EXTENSIONS);
  assert.equal(reset.dialog, null);
  assert.deepEqual(reset.statuses, []);
});

test("responseFor builds the frame payload for every answer shape", () => {
  const select = dialog("s", { method: "select", options: ["x", "y"] });
  assert.deepEqual(responseFor(select, { value: "x" }), { id: "s", value: "x" });

  const confirm = dialog("c");
  assert.deepEqual(responseFor(confirm, { confirmed: true }), { id: "c", confirmed: true });
  assert.deepEqual(responseFor(confirm, { confirmed: false }), { id: "c", confirmed: false });

  const editor = dialog("e", { method: "editor", prefill: "p", promptStyle: true });
  assert.deepEqual(responseFor(editor, { value: "typed" }), { id: "e", value: "typed" });
  assert.deepEqual(responseFor(editor, { cancelled: true }), { id: "e", cancelled: true });

  const ask = dialog("a", { method: "ask", questions: [{ question: "q", options: [{ label: "l" }] }] });
  const answers = [{ question: "q", answer: "l" }];
  assert.deepEqual(responseFor(ask, { answers }), { id: "a", answers });
});

test("reduction never mutates the input state", () => {
  const fixture = deepFreeze({
    dialog: dialog("a", { options: ["x"], timeoutMs: 1000, expiresAt: 2000 }),
    answeredId: null,
    statuses: [{ key: "s", text: "one" }],
    widgets: [{ key: "w", lines: ["line"], placement: "aboveEditor" }],
    panel: { id: "p", title: "P" },
  });

  const events = [
    { type: "dialog", dialog: dialog("b") },
    { type: "answered", id: "a" },
    { type: "cancel", targetId: "a" },
    { type: "status", key: "s", text: "two" },
    { type: "status", key: "s", text: null },
    { type: "widget", key: "w", lines: ["other"], placement: "belowEditor" },
    { type: "widget", key: "w", lines: null },
    { type: "panel-open", panel: { id: "q" } },
    { type: "panel-close", id: "p" },
    { type: "reset" },
  ];
  for (const event of events) {
    const before = JSON.stringify(fixture);
    reduceExtensions(fixture, event);
    assert.equal(JSON.stringify(fixture), before);
  }

  const status = reduceExtensions(fixture, { type: "status", key: "s", text: "two" });
  assert.equal(fixture.statuses[0].text, "one");
  assert.notEqual(status.statuses, fixture.statuses);
});

test("empty state is frozen-by-convention and reusable", () => {
  assert.deepEqual(EMPTY_EXTENSIONS, {
    dialog: null,
    answeredId: null,
    statuses: [],
    widgets: [],
    panel: null,
  });
  const after = reduceExtensions(EMPTY_EXTENSIONS, { type: "status", key: "a", text: "b" });
  assert.deepEqual(EMPTY_EXTENSIONS.statuses, []);
  assert.equal(after.statuses.length, 1);
});
