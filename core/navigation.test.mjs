import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  createNavigationHistory,
  pushNavigationEntry,
  currentNavigationEntry,
  stepNavigationHistory,
  peekNavigationEntry,
  removeNavigationEntryAt,
  canGoNavigationBack,
  canGoNavigationForward,
  navigateShortcutDirection,
  navigateShortcutHint,
  isMacPlatform,
  NAVIGATION_HISTORY_MAX_ENTRIES,
} = await jiti.import("./navigation.ts");

const session = (id, cwd = "/repo") => ({ sessionId: id, cwd });
const newChat = (cwd) => ({ sessionId: null, cwd });
const ev = (fields) => ({ metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, key: "", isComposing: false, ...fields });

test("pushing onto an empty history seeds the first entry", () => {
  const seeded = pushNavigationEntry(createNavigationHistory(), session("a"));
  assert.equal(currentNavigationEntry(seeded)?.sessionId, "a");
  assert.equal(seeded.entries.length, 1);
  assert.equal(seeded.index, 0);
});

test("pushing the same session again is a no-op that keeps the identity", () => {
  const seeded = pushNavigationEntry(createNavigationHistory(), session("a"));
  assert.equal(pushNavigationEntry(seeded, session("a")), seeded);
  assert.equal(pushNavigationEntry(seeded, session("a")).entries.length, 1);
});

test("session entries compare by id only; cwd changes do not fork history", () => {
  const seeded = pushNavigationEntry(createNavigationHistory(), session("a", "/one"));
  assert.equal(pushNavigationEntry(seeded, session("a", "/two")), seeded);
});

test("new-chat entries compare by cwd", () => {
  const seeded = pushNavigationEntry(createNavigationHistory(), newChat("/one"));
  assert.equal(pushNavigationEntry(seeded, newChat("/one")), seeded);
  const moved = pushNavigationEntry(seeded, newChat("/two"));
  assert.equal(moved.entries.length, 2);
  assert.equal(moved.index, 1);
});

test("pushing after stepping back truncates the forward branch", () => {
  let h = createNavigationHistory();
  h = pushNavigationEntry(h, session("a"));
  h = pushNavigationEntry(h, session("b"));
  h = pushNavigationEntry(h, session("c"));
  h = stepNavigationHistory(h, -1);
  h = pushNavigationEntry(h, session("d"));
  assert.deepEqual(h.entries.map((entry) => entry.sessionId), ["a", "b", "d"]);
  assert.equal(h.index, 2);
});

test("history is capped at the maximum entry count, dropping the oldest", () => {
  let h = createNavigationHistory();
  const total = NAVIGATION_HISTORY_MAX_ENTRIES + 10;
  for (let i = 0; i < total; i++) h = pushNavigationEntry(h, session(`s${i}`));
  assert.equal(h.entries.length, NAVIGATION_HISTORY_MAX_ENTRIES);
  assert.equal(h.index, h.entries.length - 1);
  assert.equal(h.entries[0].sessionId, `s${total - NAVIGATION_HISTORY_MAX_ENTRIES}`);
});

test("back/forward availability follows the index bounds", () => {
  const empty = createNavigationHistory();
  assert.equal(canGoNavigationBack(empty), false);
  assert.equal(canGoNavigationForward(empty), false);
  let h = pushNavigationEntry(empty, session("a"));
  assert.equal(canGoNavigationBack(h), false);
  assert.equal(canGoNavigationForward(h), false);
  h = pushNavigationEntry(h, session("b"));
  assert.equal(canGoNavigationBack(h), true);
  assert.equal(canGoNavigationForward(h), false);
  h = { entries: h.entries, index: 0 };
  assert.equal(canGoNavigationBack(h), false);
  assert.equal(canGoNavigationForward(h), true);
});

test("peek returns the neighbor entry without moving; missing neighbors are null", () => {
  let h = createNavigationHistory();
  assert.equal(peekNavigationEntry(h, -1), null);
  assert.equal(peekNavigationEntry(h, 1), null);
  h = pushNavigationEntry(h, session("a"));
  h = pushNavigationEntry(h, session("b"));
  h = pushNavigationEntry(h, session("c"));
  assert.equal(peekNavigationEntry(h, -1)?.sessionId, "b");
  assert.equal(peekNavigationEntry(h, 1), null);
});

test("stepping is clamped and never mutates the input history", () => {
  let h = createNavigationHistory();
  h = pushNavigationEntry(h, session("a"));
  h = pushNavigationEntry(h, session("b"));
  const frozen = h;
  const before = currentNavigationEntry(h)?.sessionId;
  assert.equal(stepNavigationHistory(h, 1), h);
  const stepped = stepNavigationHistory(h, -1);
  assert.equal(currentNavigationEntry(stepped)?.sessionId, "a");
  assert.equal(currentNavigationEntry(frozen)?.sessionId, before);
  assert.equal(currentNavigationEntry(h)?.sessionId, before);
});

test("removing an entry before the current one shifts the index onto the same entry", () => {
  let h = createNavigationHistory();
  h = pushNavigationEntry(h, session("a"));
  h = pushNavigationEntry(h, session("dead"));
  h = pushNavigationEntry(h, session("c"));
  h = removeNavigationEntryAt(h, 1);
  assert.deepEqual(h.entries.map((entry) => entry.sessionId), ["a", "c"]);
  assert.equal(h.index, 1);
});

test("removing an entry after the current one keeps the index", () => {
  let h = createNavigationHistory();
  h = pushNavigationEntry(h, session("a"));
  h = pushNavigationEntry(h, session("dead"));
  h = removeNavigationEntryAt(h, 1);
  assert.deepEqual(h.entries.map((entry) => entry.sessionId), ["a"]);
  assert.equal(h.index, 0);
});

test("removing out-of-range or from an empty history is a no-op", () => {
  const empty = createNavigationHistory();
  assert.equal(removeNavigationEntryAt(empty, 0), empty);
  const h = pushNavigationEntry(empty, session("a"));
  assert.equal(removeNavigationEntryAt(h, 5), h);
  assert.equal(removeNavigationEntryAt(h, -1), h);
});

test("shortcut matcher: macOS uses Cmd+[ / Cmd+]", () => {
  assert.equal(navigateShortcutDirection(ev({ metaKey: true, key: "[" }), true), -1);
  assert.equal(navigateShortcutDirection(ev({ metaKey: true, key: "]" }), true), 1);
  assert.equal(navigateShortcutDirection(ev({ altKey: true, key: "ArrowLeft" }), true), 0);
  assert.equal(navigateShortcutDirection(ev({ altKey: true, key: "ArrowRight" }), true), 0);
  assert.equal(navigateShortcutDirection(ev({ ctrlKey: true, key: "[" }), true), 0);
});

test("shortcut matcher: Windows/Linux use Alt+Arrow and accept Ctrl+[ as an alias", () => {
  assert.equal(navigateShortcutDirection(ev({ altKey: true, key: "ArrowLeft" }), false), -1);
  assert.equal(navigateShortcutDirection(ev({ altKey: true, key: "ArrowRight" }), false), 1);
  assert.equal(navigateShortcutDirection(ev({ metaKey: true, key: "[" }), false), -1);
  assert.equal(navigateShortcutDirection(ev({ ctrlKey: true, key: "]" }), false), 1);
});

test("shortcut matcher: hardware browser keys work on every platform", () => {
  assert.equal(navigateShortcutDirection(ev({ key: "BrowserBack" }), true), -1);
  assert.equal(navigateShortcutDirection(ev({ key: "BrowserForward" }), false), 1);
});

test("shortcut matcher: rejects modified/plain/unrelated keys and composition", () => {
  assert.equal(navigateShortcutDirection(ev({ key: "[" }), false), 0);
  assert.equal(navigateShortcutDirection(ev({ key: "]" }), true), 0);
  assert.equal(navigateShortcutDirection(ev({ key: "ArrowLeft" }), false), 0);
  assert.equal(navigateShortcutDirection(ev({ metaKey: true, shiftKey: true, key: "[" }), true), 0);
  assert.equal(navigateShortcutDirection(ev({ altKey: true, shiftKey: true, key: "ArrowLeft" }), false), 0);
  assert.equal(navigateShortcutDirection(ev({ metaKey: true, altKey: true, key: "[" }), true), 0);
  assert.equal(navigateShortcutDirection(ev({ altKey: true, ctrlKey: true, key: "ArrowLeft" }), false), 0);
  assert.equal(navigateShortcutDirection(ev({ metaKey: true, key: "[", isComposing: true }), true), 0);
});

test("shortcut hints render per platform", () => {
  assert.equal(navigateShortcutHint(-1, true), "⌘[");
  assert.equal(navigateShortcutHint(1, true), "⌘]");
  assert.equal(navigateShortcutHint(-1, false), "Alt+←");
  assert.equal(navigateShortcutHint(1, false), "Alt+→");
});

test("platform probe reads the host's platform and user agent", () => {
  assert.equal(isMacPlatform("MacIntel", "Mozilla/5.0"), true);
  assert.equal(isMacPlatform("Win32", "Mozilla/5.0 (Macintosh)"), true);
  assert.equal(isMacPlatform("Linux x86_64", "Mozilla/5.0 (X11; Linux)"), false);
  assert.equal(isMacPlatform("Win32", "Mozilla/5.0 (Windows NT 10.0)"), false);
});
