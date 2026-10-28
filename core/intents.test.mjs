import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { toFrame, isLocalIntent } = await jiti.import("./commands");
const { applyRecovery, isDraftEmpty, parseDraft, serializeDraft, draftKeysToEvict, mergeRecoveredText, EMPTY_DRAFT } = await jiti.import("./drafts");
const { branchReducer, initialBranching, isHistoryBusy, canBeginEdit, canBeginFork } = await jiti.import("./branching");

test("every intent maps to its runtime frame", () => {
  const cases = [
    [{ kind: "prompt", text: "hi" }, { type: "prompt", message: "hi" }],
    [{ kind: "prompt", text: "hi", images: [{ data: "x", mimeType: "image/png" }] }, { type: "prompt", message: "hi", images: [{ data: "x", mimeType: "image/png" }] }],
    [{ kind: "steer", text: "go" }, { type: "steer", message: "go", streamingBehavior: "steer" }],
    [{ kind: "follow-up", text: "later" }, { type: "follow_up", message: "later" }],
    [{ kind: "abort" }, { type: "abort" }],
    [{ kind: "abort-compaction" }, { type: "abort_compaction" }],
    [{ kind: "compact" }, { type: "compact" }],
    [{ kind: "compact", instructions: "keep it" }, { type: "compact", instructions: "keep it" }],
    [{ kind: "queue-remove", queue: "steering", text: "a" }, { type: "remove_queued_message", queue: "steering", message: "a" }],
    [{ kind: "queue-promote", text: "b" }, { type: "promote_queued_message", message: "b" }],
    [{ kind: "edit-entry", entryId: "e1", text: "new" }, { type: "edit_message", entryId: "e1", message: "new" }],
    [{ kind: "fork-entry", entryId: "e2", withEdits: true }, { type: "fork", entryId: "e2", editsPrompt: true }],
    [{ kind: "select-model", provider: "p", modelId: "m" }, { type: "set_model", provider: "p", modelId: "m" }],
    [{ kind: "set-thinking", level: "high" }, { type: "set_thinking_level", level: "high" }],
    [{ kind: "set-fast-mode", enabled: true }, { type: "set_fast_mode", enabled: true }],
    [{ kind: "set-slow-mode", enabled: false }, { type: "set_slow_mode", enabled: false }],
    [{ kind: "set-auto-compaction", enabled: true }, { type: "set_auto_compaction", enabled: true }],
    [{ kind: "set-interrupt-mode", mode: "wait" }, { type: "set_interrupt_mode", mode: "wait" }],
    [{ kind: "set-streaming-mode", mode: "followUp" }, { type: "set_streaming_mode", mode: "followUp" }],
    [{ kind: "set-session-name", name: "Refactor" }, { type: "set_session_name", name: "Refactor" }],
    [{ kind: "extension-response", requestId: "r1", response: { ok: true } }, { type: "extension_ui_response", id: "r1", ok: true }],
    [{ kind: "refresh-state" }, { type: "get_state" }],
  ];
  for (const [intent, frame] of cases) {
    assert.deepEqual(toFrame(intent), frame, `intent ${intent.kind}`);
  }
});

test("local intents never produce a frame", () => {
  for (const intent of [
    { kind: "navigate-leaf", leafId: "l1" },
    { kind: "toggle-pre-compaction" },
    { kind: "draft-edit", patch: { text: "x" } },
    { kind: "draft-clear" },
  ]) {
    assert.equal(isLocalIntent(intent), true, intent.kind);
    assert.equal(toFrame(intent), null, intent.kind);
  }
  assert.equal(isLocalIntent({ kind: "abort" }), false);
});

test("recovery replaces an earlier recovery while its lead is intact", () => {
  assert.equal(mergeRecoveredText("hello world", { text: "HELLO", replace: { lead: "hello", fallback: "HELLO" } }), "HELLO world");
  assert.equal(mergeRecoveredText("other", { text: "HELLO", replace: { lead: "hello", fallback: "HELLO" } }), "HELLO\n\nother");
  assert.equal(mergeRecoveredText("", { text: "HELLO" }), "HELLO");
  assert.equal(mergeRecoveredText("keep", { text: "" }), "keep");
});

test("a recovery appends images and keeps files", () => {
  const draft = { value: "a", images: [{ data: "1", mimeType: "image/png" }], files: [{ name: "f", mimeType: "text/plain", content: "c", size: 1 }] };
  const next = applyRecovery(draft, { text: "b", images: [{ data: "2", mimeType: "image/png" }] });
  assert.equal(next.value, "b\n\na");
  assert.equal(next.images.length, 2);
  assert.equal(next.files.length, 1);
});

test("emptiness ignores whitespace text but not attachments", () => {
  assert.equal(isDraftEmpty(EMPTY_DRAFT), true);
  assert.equal(isDraftEmpty({ ...EMPTY_DRAFT, value: "   " }), true);
  assert.equal(isDraftEmpty({ ...EMPTY_DRAFT, images: [{ data: "1", mimeType: "image/png" }] }), false);
});

test("persisted drafts are validated, not trusted", () => {
  assert.equal(parseDraft(null), null);
  assert.equal(parseDraft(42), null);
  assert.equal(parseDraft({}), null);
  assert.deepEqual(parseDraft({ value: "text" }), { value: "text", images: [], files: [] });
  assert.deepEqual(parseDraft("legacy text"), { value: "legacy text", images: [], files: [] });
  assert.deepEqual(parseDraft(JSON.stringify({ value: "json", images: [], files: [] })), { value: "json", images: [], files: [] });
  assert.equal(parseDraft("{broken"), null);
  assert.deepEqual(
    parseDraft({ value: "", images: [{ data: 1 }, { data: "d", mimeType: "image/png" }], files: [{ name: "n" }] }),
    { value: "", images: [{ data: "d", mimeType: "image/png" }], files: [] },
  );
  assert.equal(serializeDraft(EMPTY_DRAFT), null);
  assert.equal(JSON.parse(serializeDraft({ ...EMPTY_DRAFT, value: "x" })).value, "x");
});

test("the draft store evicts oldest keys past its cap", () => {
  assert.deepEqual(draftKeysToEvict(["a", "b"], 2), []);
  assert.deepEqual(draftKeysToEvict(["a", "b", "c"], 2), ["a"]);
});

test("editing and forking exclude each other", () => {
  const editing = branchReducer(initialBranching, { type: "edit-begin", entryId: "e1" });
  assert.equal(editing.editingEntryId, "e1");
  assert.equal(isHistoryBusy(editing), true);

  const blockedFork = branchReducer(editing, { type: "fork-begin", entryId: "e2" });
  assert.equal(blockedFork, editing, "a fork cannot start while editing");
  assert.equal(canBeginFork(editing, "e2"), false);
  assert.equal(canBeginEdit(editing, "e1"), true, "the same edit may be reopened");
  assert.equal(canBeginEdit(editing, "e3"), false);

  const settled = branchReducer(editing, { type: "edit-settled" });
  assert.equal(settled.editingEntryId, null);
  assert.equal(canBeginFork(settled, "e2"), true);
});

test("settling a fork clears only the fork gate", () => {
  const forking = branchReducer(initialBranching, { type: "fork-begin", entryId: "e9" });
  const selected = branchReducer(forking, { type: "leaf-select", leafId: "leaf-2" });
  assert.equal(selected.leafId, "leaf-2");
  const settled = branchReducer(selected, { type: "fork-settled" });
  assert.deepEqual(settled, { editingEntryId: null, forkingEntryId: null, leafId: "leaf-2" });
});
