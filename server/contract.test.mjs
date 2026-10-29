import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "bun:test";
import { z } from "zod";

const { errorEnvelope, readRouteContract } = await import("./contract.ts");

const ROUTES_ROOT = join(import.meta.dir, "routes");

function collectRoutes(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectRoutes(full));
    else if (entry.name === "route.ts") files.push(full);
  }
  return files;
}

function pathOf(file) {
  const segments = relative(ROUTES_ROOT, dirname(file)).split(/[\\/]/).filter(Boolean);
  const rendered = segments.map((segment) => {
    if (segment.startsWith("[...")) return `{${segment.slice(4, -1)}}`;
    if (segment.startsWith("[")) return `{${segment.slice(1, -1)}}`;
    return segment;
  });
  return `/${["api", ...rendered].join("/")}`;
}

test("every route exports a valid contract", async () => {
  const files = collectRoutes(ROUTES_ROOT).sort();
  assert.ok(files.length >= 60, "the route tree is present");
  const paths = new Set();
  for (const file of files) {
    // Routes are discovered from the filesystem, so the module set is only
    // known at runtime.
    const loaded = await import(pathToFileURL(file).href);
    const contract = readRouteContract(loaded.contract);
    assert.ok(contract, `missing or invalid contract: ${relative(process.cwd(), file)}`);
    assert.ok(Object.keys(contract).length > 0, `empty contract: ${file}`);
    for (const [method, operation] of Object.entries(contract)) {
      assert.ok(operation.summary.trim().length > 0, `${method} ${file} has no summary`);
      assert.ok(Object.keys(operation.responses).length > 0, `${method} ${file} has no responses`);
      if (operation.request?.body && typeof operation.request.body.safeParse === "function") {
        z.toJSONSchema(operation.request.body, { io: "input" });
      }
      if (operation.request?.query) z.toJSONSchema(operation.request.query, { io: "input" });
      for (const schema of Object.values(operation.responses)) {
        if (schema && typeof schema.safeParse === "function") {
          z.toJSONSchema(schema, { io: "output" });
        }
      }
    }
    paths.add(pathOf(file));
  }
  assert.equal(paths.size, files.length, "route paths are unique");
});

test("the shared error envelope is the documented { error, code } shape", () => {
  assert.equal(errorEnvelope.safeParse({ error: "boom", code: "failed" }).success, true);
  assert.equal(errorEnvelope.safeParse({ error: "boom" }).success, false);
  assert.equal(errorEnvelope.safeParse({ error: "boom", code: "failed", details: [] }).success, true);
});

test("the intent wire schema accepts the same intents as the core parser", async () => {
  const { parseChatIntent } = await import("../core/commands.ts");
  const { chatIntentSchema } = await import("./routes/agent/sessions/[id]/intent/schema.ts");
  const cases = [
    { kind: "prompt", text: "hi" },
    { kind: "steer", text: "go" },
    { kind: "follow-up", text: "later" },
    { kind: "abort" },
    { kind: "compact", instructions: "keep it" },
    { kind: "queue-remove", queue: "steering", text: "a" },
    { kind: "edit-entry", entryId: "e1", text: "new" },
    { kind: "fork-entry", entryId: "e1", withEdits: true },
    { kind: "navigate-leaf", leafId: null },
    { kind: "set-thinking", level: "high" },
    { kind: "set-streaming-mode", mode: "followUp" },
    { kind: "extension-response", requestId: "r", response: { ok: true } },
    { kind: "draft-edit", patch: { text: "draft" } },
    { kind: "refresh-state" },
  ];
  for (const intent of cases) {
    assert.equal(chatIntentSchema.safeParse(intent).success, true, JSON.stringify(intent));
    assert.notEqual(parseChatIntent(intent), null, JSON.stringify(intent));
  }
  for (const value of [{ kind: "nope" }, { kind: "set-thinking", level: "extreme" }, { kind: "prompt" }]) {
    assert.equal(chatIntentSchema.safeParse(value).success, false, JSON.stringify(value));
    assert.equal(parseChatIntent(value), null, JSON.stringify(value));
  }
});
