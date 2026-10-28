import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { buildCatalog, filterCommands, parseCommandLine, resolveInput } = await jiti.import("./slash");
const { WEB_COMMANDS } = await jiti.import("./web-commands");

function runtime(name, options = {}) {
  return { name, source: "runtime", requiresArgs: false, ...options };
}

test("parseCommandLine splits the name at the first whitespace and trims args", () => {
  assert.deepEqual(parseCommandLine("/goal ship it"), { name: "goal", args: "ship it" });
  assert.deepEqual(parseCommandLine("/goal"), { name: "goal", args: "" });
  assert.deepEqual(parseCommandLine("/goal   "), { name: "goal", args: "" });
  assert.deepEqual(parseCommandLine("/goal \n ship \n it \n"), { name: "goal", args: "ship \n it" });

  assert.equal(parseCommandLine("/"), null);
  assert.equal(parseCommandLine(""), null);
  assert.equal(parseCommandLine("plain text"), null);
  assert.equal(parseCommandLine("/ spaced "), null);
  assert.equal(parseCommandLine("   /goal ship"), null);
  assert.equal(parseCommandLine("x /goal ship"), null);
});

test("runtime entries shadow web entries with the same name and come first", () => {
  const runtimeGoal = runtime("goal", { requiresArgs: false });
  const catalog = buildCatalog([runtimeGoal], WEB_COMMANDS);

  assert.equal(catalog.entries[0], runtimeGoal);
  assert.equal(catalog.entries.filter((entry) => entry.name === "goal").length, 1);

  const resolved = resolveInput(catalog, "/goal ship it");
  assert.equal(resolved.kind, "runtime");
  assert.equal(resolved.entry, runtimeGoal);
  assert.equal(resolved.args, "ship it");
});

test("aliases resolve to their entry and match in filters", () => {
  const deploy = runtime("deploy", { aliases: ["ship", "release"] });
  const catalog = buildCatalog([deploy], WEB_COMMANDS);

  const resolved = resolveInput(catalog, "/ship production");
  assert.equal(resolved.kind, "runtime");
  assert.equal(resolved.entry, deploy);
  assert.equal(resolved.args, "production");

  assert.deepEqual(filterCommands(catalog, "SHI"), [deploy]);
  assert.deepEqual(filterCommands(catalog, "Rel"), [deploy]);
  assert.deepEqual(filterCommands(catalog, "deploy"), [deploy]);
  assert.deepEqual(filterCommands(catalog, "ghost"), []);
  assert.equal(resolveInput(catalog, "/Ship production").kind, "prompt");
});

test("filterCommands matches case-insensitive prefixes and preserves catalog order", () => {
  const catalog = buildCatalog([runtime("status"), runtime("stop")], WEB_COMMANDS);
  assert.deepEqual(
    filterCommands(catalog, "s").map((entry) => entry.name),
    ["status", "stop", "simplify"],
  );
  assert.equal(filterCommands(catalog, "").length, catalog.entries.length);
  assert.equal(filterCommands(catalog, "  ").length, catalog.entries.length);
  assert.deepEqual(filterCommands(catalog, "goal").map((entry) => entry.name), ["goal"]);
  assert.deepEqual(filterCommands(catalog, "/goal"), []);
});

test("requiresArgs with empty args yields usage for runtime and web entries", () => {
  const web = buildCatalog([], [{ name: "needs", source: "web", requiresArgs: true, buildPrompt: (args) => args }]);
  const webResult = resolveInput(web, "/needs   ");
  assert.equal(webResult.kind, "usage");
  assert.equal(webResult.entry.name, "needs");

  const runtimeCatalog = buildCatalog([runtime("needs", { requiresArgs: true })], []);
  const runtimeResult = resolveInput(runtimeCatalog, "/needs");
  assert.equal(runtimeResult.kind, "usage");
  assert.equal(runtimeResult.entry.source, "runtime");
});

test("web entry without buildPrompt yields usage instead of expanding", () => {
  const catalog = buildCatalog([], [{ name: "broken", source: "web", requiresArgs: false }]);
  const result = resolveInput(catalog, "/broken anything");
  assert.equal(result.kind, "usage");
  assert.equal(result.entry.name, "broken");
});

test("unknown commands and non-commands are forwarded as prompt text", () => {
  const catalog = buildCatalog([], WEB_COMMANDS);
  assert.deepEqual(resolveInput(catalog, "/vibe"), { kind: "prompt" });
  assert.deepEqual(resolveInput(catalog, "/"), { kind: "prompt" });
  assert.deepEqual(resolveInput(catalog, "hello /goal world"), { kind: "prompt" });
  assert.deepEqual(resolveInput(catalog, ""), { kind: "prompt" });
});

test("web commands expand through the catalog", () => {
  const catalog = buildCatalog([], WEB_COMMANDS);
  assert.deepEqual(
    WEB_COMMANDS.map((entry) => entry.name),
    ["goal", "plan", "review", "fix", "test", "explain", "simplify", "commit", "advisor", "loop"],
  );
  assert.ok(WEB_COMMANDS.every((entry) => entry.source === "web" && typeof entry.buildPrompt === "function"));
  assert.deepEqual(
    new Set(WEB_COMMANDS.filter((entry) => entry.requiresArgs).map((entry) => entry.name)),
    new Set(["goal", "plan", "fix", "test", "explain", "simplify", "loop"]),
  );

  const goal = resolveInput(catalog, "/goal ship the export");
  assert.equal(goal.kind, "expand");
  assert.match(goal.prompt, /Work toward this goal for the rest of the session/);
  assert.match(goal.prompt, /ship the export/);
  assert.equal(resolveInput(catalog, "/goal").kind, "usage");
  assert.equal(resolveInput(catalog, "/goal ").kind, "usage");
  assert.equal(resolveInput(catalog, "/GOAL ship").kind, "prompt");

  const review = WEB_COMMANDS.find((entry) => entry.name === "review");
  assert.ok(review?.buildPrompt);
  assert.match(review.buildPrompt(""), /current project state and recent changes/);
  assert.match(review.buildPrompt("lib/model-catalog.ts"), /Review lib\/model-catalog\.ts for bugs/);
  const reviewResolved = resolveInput(catalog, "/review");
  assert.equal(reviewResolved.kind, "expand");
  assert.match(reviewResolved.prompt, /current project state and recent changes/);

  const commit = WEB_COMMANDS.find((entry) => entry.name === "commit");
  assert.ok(commit?.buildPrompt);
  assert.match(commit.buildPrompt(""), /clear conventional commit message/);
  assert.match(commit.buildPrompt("feat: add catalog"), /commit the current changes with this message: "feat: add catalog"/);

  const advisor = WEB_COMMANDS.find((entry) => entry.name === "advisor");
  assert.ok(advisor?.buildPrompt);
  assert.match(advisor.buildPrompt(""), /independent advisor reviewing the current work/);
  assert.match(advisor.buildPrompt("the retry logic"), /reviewing this work: the retry logic/);
  const advisorResolved = resolveInput(catalog, "/advisor the retry logic");
  assert.equal(advisorResolved.kind, "expand");
  assert.match(advisorResolved.prompt, /the retry logic/);

  const loop = WEB_COMMANDS.find((entry) => entry.name === "loop");
  assert.ok(loop?.buildPrompt);
  const counted = loop.buildPrompt("3 run the test suite");
  assert.match(counted, /up to 3 attempts/);
  assert.ok(counted.includes("run the test suite"));
  assert.match(loop.buildPrompt("run the test suite"), /up to 3 attempts/);
  assert.match(loop.buildPrompt("0 keep trying"), /up to 3 attempts/);
  assert.match(loop.buildPrompt("5 polish the edges"), /up to 5 attempts/);
  assert.match(loop.buildPrompt("50 clamp the retries"), /up to 10 attempts/);
  assert.match(loop.buildPrompt("999 run the test suite"), /up to 10 attempts/);
  const loopResolved = resolveInput(catalog, "/loop 2 fix the flake");
  assert.equal(loopResolved.kind, "expand");
  assert.match(loopResolved.prompt, /up to 2 attempts/);
  assert.equal(resolveInput(catalog, "/loop").kind, "usage");

  assert.equal(resolveInput(catalog, "just a message").kind, "prompt");
  assert.equal(resolveInput(catalog, "/compact").kind, "prompt");
  assert.equal(resolveInput(catalog, "/vibe go fast").kind, "prompt");
});
