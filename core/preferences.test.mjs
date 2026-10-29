import assert from "node:assert/strict";
import { test } from "bun:test";

const {
  getSubmitDuringRunBehavior,
  setSubmitDuringRunBehavior,
  getWordCompletionMode,
  setWordCompletionMode,
  isWordCompletionEnabled,
  getPreferredToolPreset,
  setPreferredToolPreset,
} = await import("./preferences.ts");
const { getToolNamesForPreset } = await import("./tool-presets.ts");

function createStorage(values = {}) {
  const entries = new Map(Object.entries(values));
  return {
    getItem(key) { return entries.get(key) ?? null; },
    setItem(key, value) { entries.set(key, value); },
  };
}

test("submitting during a run defaults to queue; only a stored choice overrides it", () => {
  // No store at all (SSR prerender) — the default must not need a client.
  assert.equal(getSubmitDuringRunBehavior(null), "queue");
  assert.equal(getSubmitDuringRunBehavior(createStorage()), "queue");
  assert.equal(getSubmitDuringRunBehavior(createStorage({ "omp-web:word-completion": "steer" })), "queue");
  assert.equal(getSubmitDuringRunBehavior(createStorage({ "omp-web:submit-during-run": "steer" })), "steer");

  const storage = createStorage();
  setSubmitDuringRunBehavior(storage, "queue");
  assert.equal(getSubmitDuringRunBehavior(storage), "queue");
  assert.equal(getSubmitDuringRunBehavior(createStorage({ "omp-web:submit-during-run": "sometimes" })), "queue");
});

test("word completion defaults to auto: on with a mouse/trackpad, off on touch", () => {
  assert.equal(getWordCompletionMode(null), "auto");
  assert.equal(isWordCompletionEnabled("auto", true), true);
  assert.equal(isWordCompletionEnabled("auto", false), false);
});

test("Enabled and Disabled override the pointer heuristic; junk falls back to auto", () => {
  assert.equal(isWordCompletionEnabled("on", false), true);
  assert.equal(isWordCompletionEnabled("off", true), false);

  const storage = createStorage({ "omp-web:word-completion": "off" });
  assert.equal(getWordCompletionMode(storage), "off");
  setWordCompletionMode(storage, "on");
  assert.equal(getWordCompletionMode(storage), "on");
  assert.equal(getWordCompletionMode(createStorage({ "omp-web:word-completion": "sometimes" })), "auto");
});

test("defaults to the full OMP toolset and persists explicit choices", () => {
  const storage = createStorage({ "omp-web:tool-preset": "unknown" });
  assert.equal(getPreferredToolPreset(storage), "full");

  setPreferredToolPreset(storage, "default");
  assert.equal(getPreferredToolPreset(storage), "default");

  setPreferredToolPreset(storage, "full");
  assert.equal(getPreferredToolPreset(storage), "full");
  assert.equal(getPreferredToolPreset(null), "full");
});

test("full preset leaves OMP's native toolset unrestricted", () => {
  assert.equal(getToolNamesForPreset("full"), undefined);
  assert.deepEqual(getToolNamesForPreset("default"), ["read", "bash", "edit", "write"]);
  assert.deepEqual(getToolNamesForPreset("none"), []);
});

test("a throwing store reads as unset and never breaks a write path", () => {
  const broken = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  assert.equal(getSubmitDuringRunBehavior(broken), "queue");
  assert.equal(getWordCompletionMode(broken), "auto");
  assert.equal(getPreferredToolPreset(broken), "full");
  setSubmitDuringRunBehavior(broken, "steer");
  setWordCompletionMode(broken, "off");
  setPreferredToolPreset(broken, "none");
});
