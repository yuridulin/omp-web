import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { buildCatalog, filterCommands, parseCommandLine, resolveInput } = await jiti.import("./slash");
const { WEB_COMMANDS } = await jiti.import("./web-commands");
const legacy = await jiti.import("../lib/web-slash-commands.ts");

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

test("every legacy web command expands to the identical prompt", () => {
  const catalog = buildCatalog([], WEB_COMMANDS);
  assert.deepEqual(
    WEB_COMMANDS.map((entry) => entry.name),
    legacy.WEB_SLASH_COMMANDS.map((command) => command.name),
  );
  assert.ok(WEB_COMMANDS.every((entry) => entry.source === "web"));

  const samples = ["", "ship the export", "5 polish the edges", "50 clamp the retries", "0 keep trying", "feat: add catalog"];

  for (const command of legacy.WEB_SLASH_COMMANDS) {
    const entry = WEB_COMMANDS.find((candidate) => candidate.name === command.name);
    assert.ok(entry, `missing ${command.name}`);
    assert.equal(entry.requiresArgs, command.requiresArgs);
    for (const args of samples) {
      assert.equal(entry.buildPrompt(args), command.buildPrompt(args), `${command.name} prompt drift for ${JSON.stringify(args)}`);
    }

    const requiredArgs = command.requiresArgs ? "do the thing" : "";
    const expected = legacy.expandWebSlashCommand(`/${command.name} ${requiredArgs}`);
    assert.notEqual(expected.kind, "not-web");
    const resolved = resolveInput(catalog, `/${command.name} ${requiredArgs}`);
    if (expected.kind === "usage-error") {
      assert.equal(resolved.kind, "usage");
    } else {
      assert.equal(resolved.kind, "expand");
      assert.equal(resolved.prompt, expected.prompt);
    }

    const noArgs = resolveInput(catalog, `/${command.name}`);
    const legacyNoArgs = legacy.expandWebSlashCommand(`/${command.name}`);
    if (legacyNoArgs.kind === "usage-error") assert.equal(noArgs.kind, "usage");
    else {
      assert.equal(noArgs.kind, "expand");
      assert.equal(noArgs.prompt, legacyNoArgs.prompt);
    }
  }
});
