import assert from "node:assert/strict";
import { test } from "bun:test";
import { historyCursor, HISTORY_READ_ATTEMPTS, parseHistoryCursor, readHistoryPageSettled, selectHistoryRange, selectSessionHistory } from "./session-sync.ts";
import { SessionChangedWhileReadingError } from "./session-reader.ts";

function context(ids) {
  return {
    messages: ids.map(() => ({ role: "assistant", content: [{ type: "text", text: "Repeated answer" }], model: "test", provider: "test" })),
    entryIds: ids,
    thinkingLevel: "high",
    model: { provider: "test", modelId: "test" },
    todoPhases: [],
  };
}

test("catch-up returns only entries after the confirmed cursor, including identical messages", () => {
  const saved = context(["a", "b", "c"]);
  const page = selectSessionHistory(saved, historyCursor(context(["a"])), 200);
  assert.equal(page.mode, "append");
  assert.equal(page.baseEntryId, "a");
  assert.deepEqual(page.context.entryIds, ["b", "c"]);
  assert.deepEqual(page.context.messages, [saved.messages[1], saved.messages[2]]);
  assert.deepEqual(page.cursor, { firstEntryId: "a", lastEntryId: "c" });
  assert.equal(page.hasMore, false);
  assert.equal(page.context.thinkingLevel, "high");
});

test("pages remain contiguous while new entries are appended", () => {
  const initial = selectSessionHistory(context(["a", "b", "c", "d"]), null, 2);
  assert.equal(initial.mode, "replace");
  assert.deepEqual(initial.context.entryIds, ["a", "b"]);
  assert.equal(initial.hasMore, true);
  const next = selectSessionHistory(context(["a", "b", "c", "d", "e"]), initial.cursor, 2);
  const last = selectSessionHistory(context(["a", "b", "c", "d", "e"]), next.cursor, 2);
  assert.deepEqual([...initial.context.entryIds, ...next.context.entryIds, ...last.context.entryIds], ["a", "b", "c", "d", "e"]);
  assert.equal(next.mode, "append");
  assert.equal(last.hasMore, false);
});

test("an orphaned branch cursor replaces history instead of appending unrelated entries", () => {
  const page = selectSessionHistory(context(["root", "other"]), historyCursor(context(["root", "old-branch"])));
  assert.equal(page.mode, "replace");
  assert.deepEqual(page.context.entryIds, ["root", "other"]);
  assert.equal(page.baseEntryId, null);
});

test("compaction changes the context prefix even when the old cursor survives", () => {
  const page = selectSessionHistory(context(["summary", "kept", "new"]), historyCursor(context(["old", "kept"])));
  assert.equal(page.mode, "replace");
  assert.deepEqual(page.context.entryIds, ["summary", "kept", "new"]);
});

test("an unchanged context returns an empty delta and retains its cursor", () => {
  const cursor = historyCursor(context(["a", "b"]));
  const page = selectSessionHistory(context(["a", "b"]), cursor);
  assert.equal(page.mode, "append");
  assert.deepEqual(page.context.messages, []);
  assert.deepEqual(page.context.entryIds, []);
  assert.deepEqual(page.cursor, cursor);
});

test("empty history remains resumable and truncation produces a reset", () => {
  const empty = selectSessionHistory(context([]), null);
  assert.deepEqual(empty.cursor, { firstEntryId: null, lastEntryId: null });
  assert.equal(selectSessionHistory(context([]), empty.cursor).mode, "append");
  assert.equal(selectSessionHistory(context([]), historyCursor(context(["a"]))).mode, "replace");
  const added = selectSessionHistory(context(["a"]), empty.cursor);
  assert.equal(added.mode, "replace");
  assert.deepEqual(added.context.entryIds, ["a"]);
});

test("indexed history selection preserves cursor boundaries and rejects stale positions", () => {
  const ids = ["a", "b", "c", "d"];
  const positions = new Map(ids.map((id, index) => [id, index]));
  const cursor = { firstEntryId: "a", lastEntryId: "b" };
  const range = selectHistoryRange(ids, cursor, 1, positions);
  assert.equal(range.mode, "append");
  assert.deepEqual(ids.slice(range.start, range.end), ["c"]);
  assert.deepEqual(range.cursor, { firstEntryId: "a", lastEntryId: "c" });
  assert.equal(range.hasMore, true);
  const changed = selectHistoryRange(["a", "different", "c", "d"], cursor, 2, positions);
  assert.equal(changed.mode, "replace");
  assert.equal(changed.baseEntryId, null);
});

test("cursor parsing accepts opaque entry IDs but rejects malformed or unbounded input", () => {
  const cursor = { firstEntryId: "first-id", lastEntryId: "last-id" };
  assert.deepEqual(parseHistoryCursor(JSON.stringify(cursor)), cursor);
  assert.equal(parseHistoryCursor(null), null);
  for (const raw of ["", "[]", "null", "{}", "not-json", JSON.stringify({ firstEntryId: null, lastEntryId: "id" }), JSON.stringify({ firstEntryId: "a", lastEntryId: "x".repeat(257) }), " ".repeat(2049)]) {
    assert.throws(() => parseHistoryCursor(raw));
  }
});

test("a page read that raced the writer is retried instead of surfacing as a server error", async () => {
  let calls = 0;
  const page = await readHistoryPageSettled(() => {
    calls += 1;
    if (calls < 3) throw new SessionChangedWhileReadingError("while");
    return { mode: "append" };
  });
  assert.deepEqual(page, { mode: "append" });
  assert.equal(calls, 3);
});

test("a permanent race or an unrelated failure is not retried", async () => {
  let calls = 0;
  await assert.rejects(
    readHistoryPageSettled(() => {
      calls += 1;
      throw new SessionChangedWhileReadingError("truncated");
    }),
    /Session truncated/,
  );
  assert.equal(calls, HISTORY_READ_ATTEMPTS);

  calls = 0;
  await assert.rejects(
    readHistoryPageSettled(() => {
      calls += 1;
      throw new Error("Too large");
    }),
    /Too large/,
  );
  assert.equal(calls, 1);
});
