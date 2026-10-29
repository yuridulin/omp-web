import assert from "node:assert/strict";
import { test } from "bun:test";

const { contextPercent, deriveSessionStats, parseContextUsage, throughputSample } = await import(
  "./usage",
);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

function assistant(usage, content = []) {
  const message = { role: "assistant", content, model: "m", provider: "p" };
  if (usage !== undefined) message.usage = usage;
  return message;
}

function usage(overrides = {}) {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    ...overrides,
  };
}

test("empty transcript has nothing to report", () => {
  assert.equal(deriveSessionStats([]), null);
  assert.equal(deriveSessionStats([], null), null);
  assert.equal(deriveSessionStats([], { percent: 10, contextWindow: 100, tokens: 10 }), null);
});

test("messages without usage still yield counts and zero tokens", () => {
  const stats = deriveSessionStats([
    { role: "user", content: "hi" },
    assistant(undefined, [{ type: "text", text: "hello" }]),
  ]);
  assert.ok(stats);
  assert.equal(stats.userMessages, 1);
  assert.equal(stats.assistantMessages, 1);
  assert.equal(stats.toolResults, 0);
  assert.equal(stats.toolCalls, 0);
  assert.equal(stats.totalMessages, 2);
  assert.deepEqual(stats.tokens, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 });
  assert.equal(stats.cost, 0);
});

test("counts roles and only counts toolCall content blocks", () => {
  const stats = deriveSessionStats([
    { role: "user", content: "a" },
    { role: "user", content: "b" },
    { role: "custom", customType: "x", content: "c", display: true },
    assistant(usage(), [
      { type: "text", text: "thinking out loud" },
      { type: "toolCall", toolCallId: "1", toolName: "read", input: {} },
      { type: "toolCall", toolCallId: "2", toolName: "grep", input: {} },
    ]),
    { role: "toolResult", toolCallId: "1", content: [] },
    { role: "toolResult", toolCallId: "2", content: [] },
    assistant(usage(), [{ type: "text", text: "done" }]),
  ]);
  assert.ok(stats);
  assert.equal(stats.userMessages, 2);
  assert.equal(stats.assistantMessages, 2);
  assert.equal(stats.toolCalls, 2);
  assert.equal(stats.toolResults, 2);
  assert.equal(stats.totalMessages, 7);
});

test("missing usage fields count as zero", () => {
  const stats = deriveSessionStats([
    assistant({ input: 10 }),
    assistant({ output: 5, cacheRead: 2 }),
    assistant({ cacheWrite: 3, cost: { total: 0.25 } }),
  ]);
  assert.ok(stats);
  assert.deepEqual(stats.tokens, { input: 10, output: 5, cacheRead: 2, cacheWrite: 3, total: 20 });
  assert.equal(stats.cost, 0.25);
});

test("tokens.total is the arithmetic sum and costs add up", () => {
  const stats = deriveSessionStats([
    assistant(usage({ input: 1000, output: 250, cacheRead: 4000, cacheWrite: 500, cost: { total: 0.1 } })),
    assistant(usage({ input: 1, output: 2, cacheRead: 3, cacheWrite: 4, cost: { total: 0.2 } })),
  ]);
  assert.ok(stats);
  assert.deepEqual(stats.tokens, {
    input: 1001,
    output: 252,
    cacheRead: 4003,
    cacheWrite: 504,
    total: 5760,
  });
  assert.equal(stats.cost, 0.30000000000000004);
});

test("contextUsage is attached only when provided", () => {
  const messages = [{ role: "user", content: "hi" }];
  const without = deriveSessionStats(messages);
  assert.ok(without);
  assert.equal("contextUsage" in without, false);

  const nulled = deriveSessionStats(messages, null);
  assert.ok(nulled);
  assert.equal("contextUsage" in nulled, false);

  const gauge = { percent: 12.5, contextWindow: 200000, tokens: 25000 };
  const withGauge = deriveSessionStats(messages, gauge);
  assert.ok(withGauge);
  assert.deepEqual(withGauge.contextUsage, gauge);
});

test("parseContextUsage validates the window and degrades optional numbers", () => {
  const good = { percent: 50, contextWindow: 1000, tokens: 500 };
  assert.deepEqual(parseContextUsage(good), good);

  assert.deepEqual(parseContextUsage({ contextWindow: 1000 }), {
    percent: null,
    contextWindow: 1000,
    tokens: null,
  });
  assert.deepEqual(parseContextUsage({ percent: null, contextWindow: 1000, tokens: null }), {
    percent: null,
    contextWindow: 1000,
    tokens: null,
  });

  assert.equal(parseContextUsage(null), null);
  assert.equal(parseContextUsage(undefined), null);
  assert.equal(parseContextUsage("garbage"), null);
  assert.equal(parseContextUsage(42), null);
  assert.equal(parseContextUsage([]), null);
  assert.equal(parseContextUsage({}), null);
  assert.equal(parseContextUsage({ percent: 10 }), null);
  assert.equal(parseContextUsage({ contextWindow: 0 }), null);
  assert.equal(parseContextUsage({ contextWindow: -5 }), null);
  assert.equal(parseContextUsage({ contextWindow: Number.NaN }), null);
  assert.equal(parseContextUsage({ contextWindow: Number.POSITIVE_INFINITY }), null);
  assert.equal(parseContextUsage({ contextWindow: "1000" }), null);

  assert.deepEqual(
    parseContextUsage({
      percent: Number.NaN,
      contextWindow: 1000,
      tokens: -1,
    }),
    { percent: null, contextWindow: 1000, tokens: null },
  );
  assert.deepEqual(
    parseContextUsage({
      percent: Number.POSITIVE_INFINITY,
      contextWindow: 1000,
      tokens: Number.NaN,
    }),
    { percent: null, contextWindow: 1000, tokens: null },
  );
  assert.deepEqual(
    parseContextUsage({ percent: "50", contextWindow: 1000, tokens: "500" }),
    { percent: null, contextWindow: 1000, tokens: null },
  );
});

test("throughputSample accepts only finite positive numbers", () => {
  assert.equal(throughputSample(42.5), 42.5);
  assert.equal(throughputSample(0.001), 0.001);
  assert.equal(throughputSample(0), null);
  assert.equal(throughputSample(-1), null);
  assert.equal(throughputSample(Number.NaN), null);
  assert.equal(throughputSample(Number.POSITIVE_INFINITY), null);
  assert.equal(throughputSample(Number.NEGATIVE_INFINITY), null);
  assert.equal(throughputSample("12"), null);
  assert.equal(throughputSample(undefined), null);
  assert.equal(throughputSample(null), null);
});

test("contextPercent clamps, rounds and rejects unusable input", () => {
  assert.equal(contextPercent(500, 1000), 50);
  assert.equal(contextPercent(1, 3), 33.3);
  assert.equal(contextPercent(2, 3), 66.7);
  assert.equal(contextPercent(0, 1000), 0);
  assert.equal(contextPercent(999, 1000), 99.9);
  assert.equal(contextPercent(1000, 1000), 100);
  assert.equal(contextPercent(5000, 1000), 100);
  assert.equal(contextPercent(-10, 1000), 0);
  assert.equal(contextPercent(null, 1000), null);
  assert.equal(contextPercent(100, 0), null);
  assert.equal(contextPercent(100, -1), null);
  assert.equal(contextPercent(100, Number.NaN), null);
});

test("derivation does not mutate frozen input", () => {
  const messages = deepFreeze([
    { role: "user", content: "hi", timestamp: 1 },
    assistant(
      deepFreeze(
        usage({
          input: 10,
          output: 20,
          cacheRead: 30,
          cacheWrite: 40,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.5 },
        }),
      ),
      deepFreeze([
        { type: "text", text: "hi" },
        { type: "toolCall", toolCallId: "1", toolName: "read", input: { path: "x" } },
      ]),
    ),
  ]);
  const before = JSON.stringify(messages);
  const stats = deriveSessionStats(messages, deepFreeze({ percent: 1, contextWindow: 1000, tokens: 10 }));
  assert.ok(stats);
  assert.equal(stats.tokens.total, 100);
  assert.equal(JSON.stringify(messages), before);
});
