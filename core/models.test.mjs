import assert from "node:assert/strict";
import { test } from "bun:test";

const {
  DEFAULT_THINKING_LEVELS,
  cycleModel,
  findModel,
  modelKey,
  normalizeThinkingLevel,
  parseModelCatalog,
  resolveModel,
  thinkingLevelsFor,
} = await import("./models.ts");

function validEntry(overrides = {}) {
  return {
    id: "opus",
    name: "Opus",
    provider: "anthropic",
    thinkingLevels: ["off", "low", "high"],
    supportsFastMode: true,
    supportsSlowMode: false,
    ...overrides,
  };
}

function catalogOf(entries, defaultModel = null) {
  return { entries, defaultModel };
}

test("parseModelCatalog treats non-object payloads as an empty catalog", () => {
  for (const payload of [null, undefined, "models", 42, true, ["a"], []]) {
    assert.deepEqual(parseModelCatalog(payload), { entries: [], defaultModel: null });
  }
  assert.deepEqual(parseModelCatalog({}), { entries: [], defaultModel: null });
  assert.deepEqual(parseModelCatalog({ modelList: "nope" }), { entries: [], defaultModel: null });
});

test("parseModelCatalog drops entries missing id or provider", () => {
  const catalog = parseModelCatalog({
    modelList: [
      null,
      "opus",
      42,
      [],
      { id: "no-provider" },
      { provider: "no-id" },
      { id: "", provider: "anthropic" },
      { id: "opus", provider: "   " },
      validEntry(),
    ],
  });
  assert.equal(catalog.entries.length, 1);
  assert.equal(catalog.entries[0].id, "opus");
});

test("parseModelCatalog bakes a valid ladder and injects off first", () => {
  const catalog = parseModelCatalog({
    modelList: [
      validEntry({ id: "a", thinkingLevels: ["low", "high"] }),
      validEntry({ id: "b", thinkingLevels: ["off", "low"] }),
      validEntry({ id: "c", thinkingLevels: ["high", "off"] }),
      validEntry({ id: "d", thinkingLevels: ["low", 7, null, "high"] }),
      validEntry({ id: "e", thinkingLevels: "high" }),
      validEntry({ id: "f", thinkingLevels: undefined }),
    ],
  });
  const ladders = Object.fromEntries(catalog.entries.map((entry) => [entry.id, entry.thinkingLevels]));
  assert.deepEqual(ladders.a, ["off", "low", "high"]);
  assert.deepEqual(ladders.b, ["off", "low"]);
  // "off" already present, so it is not duplicated or reordered.
  assert.deepEqual(ladders.c, ["high", "off"]);
  assert.deepEqual(ladders.d, ["off", "low", "high"]);
  assert.deepEqual(ladders.e, ["off"]);
  assert.deepEqual(ladders.f, ["off"]);
});

test("parseModelCatalog defaults booleans and names", () => {
  const catalog = parseModelCatalog({
    modelList: [
      validEntry({ id: "a", supportsFastMode: undefined, supportsSlowMode: undefined, name: undefined }),
      validEntry({ id: "b", supportsFastMode: "yes", supportsSlowMode: 1, name: "  " }),
      validEntry({ id: "c", supportsFastMode: true, supportsSlowMode: true, name: "Named" }),
    ],
  });
  assert.deepEqual(
    catalog.entries.map(({ id, name, supportsFastMode, supportsSlowMode }) => ({ id, name, supportsFastMode, supportsSlowMode })),
    [
      { id: "a", name: "a", supportsFastMode: false, supportsSlowMode: false },
      { id: "b", name: "b", supportsFastMode: false, supportsSlowMode: false },
      { id: "c", name: "Named", supportsFastMode: true, supportsSlowMode: true },
    ],
  );
});

test("parseModelCatalog keeps only finite positive contextWindow and maxTokens", () => {
  const catalog = parseModelCatalog({
    modelList: [
      validEntry({ id: "none" }),
      validEntry({ id: "good", contextWindow: 200_000, maxTokens: 8_192 }),
      validEntry({ id: "zero", contextWindow: 0, maxTokens: 0 }),
      validEntry({ id: "negative", contextWindow: -1, maxTokens: -8 }),
      validEntry({ id: "nan", contextWindow: Number.NaN }),
      validEntry({ id: "infinity", maxTokens: Number.POSITIVE_INFINITY }),
      validEntry({ id: "strings", contextWindow: "200000", maxTokens: "8192" }),
    ],
  });
  const byId = Object.fromEntries(catalog.entries.map((entry) => [entry.id, entry]));
  assert.equal(byId.none.contextWindow, undefined);
  assert.equal(byId.none.maxTokens, undefined);
  assert.deepEqual([byId.good.contextWindow, byId.good.maxTokens], [200_000, 8_192]);
  for (const id of ["zero", "negative", "nan", "infinity", "strings"]) {
    assert.equal(byId[id].contextWindow, undefined, id);
    assert.equal(byId[id].maxTokens, undefined, id);
  }
});

test("parseModelCatalog dedupes by provider+id, first occurrence wins", () => {
  const catalog = parseModelCatalog({
    modelList: [
      validEntry({ id: "shared", name: "First", provider: "anthropic" }),
      validEntry({ id: "shared", name: "Second", provider: "anthropic" }),
      validEntry({ id: "shared", name: "Other provider", provider: "openai" }),
    ],
  });
  assert.equal(catalog.entries.length, 2);
  assert.deepEqual(catalog.entries.map(({ provider, name }) => ({ provider, name })), [
    { provider: "anthropic", name: "First" },
    { provider: "openai", name: "Other provider" },
  ]);
});

test("parseModelCatalog validates defaultModel", () => {
  assert.deepEqual(parseModelCatalog({ defaultModel: { provider: "anthropic", modelId: "opus" } }).defaultModel, {
    provider: "anthropic",
    modelId: "opus",
  });
  // Live state / session files spell it `id`.
  assert.deepEqual(parseModelCatalog({ defaultModel: { provider: "anthropic", id: "opus" } }).defaultModel, {
    provider: "anthropic",
    modelId: "opus",
  });
  for (const bad of [
    null,
    "anthropic/opus",
    {},
    { provider: "", modelId: "opus" },
    { provider: "anthropic", modelId: "" },
    { provider: "anthropic" },
    { modelId: "opus" },
    { provider: "   ", modelId: "opus" },
  ]) {
    assert.equal(parseModelCatalog({ defaultModel: bad }).defaultModel, null, JSON.stringify(bad));
  }
});

test("modelKey scopes the model id by provider", () => {
  assert.equal(modelKey("anthropic", "opus"), "anthropic/opus");
  assert.notEqual(modelKey("anthropic", "shared"), modelKey("openai", "shared"));
});

test("findModel requires the provider to match", () => {
  const anthropic = validEntry({ id: "shared", provider: "anthropic" });
  const openai = validEntry({ id: "shared", provider: "openai" });
  const catalog = catalogOf([anthropic, openai]);

  assert.equal(findModel(catalog, { provider: "anthropic", modelId: "shared" }), anthropic);
  assert.equal(findModel(catalog, { provider: "openai", modelId: "shared" }), openai);
  assert.equal(findModel(catalog, { provider: "google", modelId: "shared" }), null);
  assert.equal(findModel(catalog, { provider: "anthropic", modelId: "missing" }), null);
  assert.equal(findModel(catalog, null), null);
  assert.equal(findModel(catalog, undefined), null);
  assert.equal(findModel(catalogOf([]), { provider: "anthropic", modelId: "shared" }), null);
});

test("resolveModel walks explicit, default, first, then null", () => {
  const first = validEntry({ id: "first" });
  const second = validEntry({ id: "second", provider: "openai" });
  const fallback = validEntry({ id: "fallback", provider: "google" });

  assert.equal(
    resolveModel(catalogOf([first, second], { provider: "openai", modelId: "second" }), { provider: "anthropic", modelId: "first" }),
    first,
  );
  assert.equal(
    resolveModel(catalogOf([first, second], { provider: "openai", modelId: "second" }), null),
    second,
  );
  // An unusable explicit ref and an unusable default both fall through.
  assert.equal(
    resolveModel(catalogOf([first, fallback], { provider: "missing", modelId: "gone" }), { provider: "missing", modelId: "gone" }),
    first,
  );
  assert.equal(resolveModel(catalogOf([first]), null), first);
  assert.equal(resolveModel(catalogOf([]), { provider: "anthropic", modelId: "first" }), null);
  assert.equal(resolveModel(catalogOf([], null), null), null);
});

test("cycleModel wraps in both directions", () => {
  const entries = [
    validEntry({ id: "a", provider: "p" }),
    validEntry({ id: "b", provider: "p" }),
    validEntry({ id: "c", provider: "p" }),
  ];
  const catalog = catalogOf(entries);
  const [a, b, c] = entries;

  assert.equal(cycleModel(catalog, a, 1), b);
  assert.equal(cycleModel(catalog, b, 1), c);
  assert.equal(cycleModel(catalog, c, 1), a);
  assert.equal(cycleModel(catalog, c, -1), b);
  assert.equal(cycleModel(catalog, a, -1), c);
  assert.equal(cycleModel(catalog, b, -1), a);
});

test("cycleModel handles a null current, a single entry, an empty catalog and a foreign current", () => {
  const solo = validEntry({ id: "only" });
  assert.equal(cycleModel(catalogOf([solo]), null, 1), solo);
  assert.equal(cycleModel(catalogOf([solo]), solo, 1), solo);
  assert.equal(cycleModel(catalogOf([solo]), solo, -1), solo);
  assert.equal(cycleModel(catalogOf([]), null, 1), null);
  assert.equal(cycleModel(catalogOf([]), validEntry(), -1), null);
  assert.equal(cycleModel(catalogOf([]), validEntry(), 1), null);

  const [a, b] = [validEntry({ id: "a" }), validEntry({ id: "b" })];
  const catalog = catalogOf([a, b]);
  assert.equal(cycleModel(catalog, null, 1), a);
  assert.equal(cycleModel(catalog, null, -1), b);
  // A live model outside the catalog cycles as if nothing were selected.
  assert.equal(cycleModel(catalog, validEntry({ id: "live" }), 1), a);
  assert.equal(cycleModel(catalog, validEntry({ id: "live" }), -1), b);
});

test("thinkingLevelsFor prefers the baked ladder, then live efforts, then off", () => {
  const baked = validEntry({ thinkingLevels: ["off", "minimal"] });
  assert.deepEqual(thinkingLevelsFor(baked), ["off", "minimal"]);
  assert.deepEqual(thinkingLevelsFor(baked, ["low", "high"]), ["off", "minimal"]);

  // The parser never emits an empty ladder, but live metadata can still be all
  // the core knows about a non-catalog model.
  const unbaked = validEntry({ thinkingLevels: [] });
  assert.deepEqual(thinkingLevelsFor(unbaked), ["off"]);
  assert.deepEqual(thinkingLevelsFor(unbaked, null), ["off"]);
  assert.deepEqual(thinkingLevelsFor(unbaked, []), ["off"]);
  assert.deepEqual(thinkingLevelsFor(unbaked, ["low", "high"]), ["off", "low", "high"]);
});

test("normalizeThinkingLevel maps sentinels and clamps to allowed", () => {
  const allowed = ["auto", "off", "minimal", "high"];
  for (const level of [null, undefined, "", "inherit"]) {
    assert.equal(normalizeThinkingLevel(level, allowed), "auto");
  }
  assert.equal(normalizeThinkingLevel("high", allowed), "high");
  assert.equal(normalizeThinkingLevel("max", allowed), "auto");

  const noAuto = ["off", "minimal", "high"];
  assert.equal(normalizeThinkingLevel("inherit", noAuto), "off");
  assert.equal(normalizeThinkingLevel("max", noAuto), "off");
  assert.equal(normalizeThinkingLevel("minimal", noAuto), "minimal");

  const autoLast = ["off", "auto"];
  assert.equal(normalizeThinkingLevel("unknown", autoLast), "auto");
  assert.equal(normalizeThinkingLevel(null, []), "off");
  assert.equal(normalizeThinkingLevel("high", []), "off");
});

test("DEFAULT_THINKING_LEVELS mirrors lib/thinking-levels.ts", () => {
  // Replicated, not imported: core must not depend on lib at runtime.
  assert.deepEqual(DEFAULT_THINKING_LEVELS, ["auto", "off", "minimal", "low", "medium", "high", "xhigh", "max"]);
});

test("catalog ladders agree with /api/models thinkingLevelsFor semantics", () => {
  // Replica of app/api/models/route.ts: getSupportedEfforts = reasoning ? efforts : [].
  function apiThinkingLevelsFor(model) {
    if (!model.reasoning) return ["off"];
    return ["off", ...(model.thinking?.efforts ?? [])];
  }

  const models = [
    { id: "opus", name: "Opus", provider: "anthropic", reasoning: true, thinking: { efforts: ["low", "medium", "high"] } },
    { id: "haiku", name: "Haiku", provider: "anthropic", reasoning: false, thinking: { efforts: ["low", "high"] } },
    { id: "gpt", name: "GPT", provider: "openai", reasoning: true },
    { id: "gemini", name: "Gemini", provider: "google" },
  ];
  const payload = {
    modelList: models.map((model) => ({
      id: model.id,
      name: model.name,
      provider: model.provider,
      thinkingLevels: apiThinkingLevelsFor(model),
      supportsFastMode: ["anthropic", "openai", "google"].includes(model.provider),
      supportsSlowMode: ["anthropic", "openai", "google"].includes(model.provider),
    })),
    defaultModel: { provider: "anthropic", modelId: "opus" },
  };

  const catalog = parseModelCatalog(payload);
  assert.equal(catalog.entries.length, models.length);
  for (const [index, model] of models.entries()) {
    assert.deepEqual(thinkingLevelsFor(catalog.entries[index]), apiThinkingLevelsFor(model), model.id);
  }
  assert.deepEqual(thinkingLevelsFor(catalog.entries[0]), ["off", "low", "medium", "high"]);
  assert.deepEqual(thinkingLevelsFor(catalog.entries[1]), ["off"]);
  assert.deepEqual(thinkingLevelsFor(catalog.entries[2]), ["off"]);
  assert.deepEqual(thinkingLevelsFor(catalog.entries[3]), ["off"]);
  assert.deepEqual(resolveModel(catalog, null), catalog.entries[0]);
});
