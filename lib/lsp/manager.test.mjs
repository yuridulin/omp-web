import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, jest, test } from "bun:test";
import { saveWebServerSettings } from "../web-settings.ts";
import {
  changeLspDocument,
  closeLspDocument,
  disposeLsp,
  getLspDiagnostics,
  LSP_IDLE_MS,
  openLspDocument,
  setLspClientFactory,
  subscribeLsp,
} from "./manager.ts";

let agentDir;
let previousAgentDir;
let created = [];

class FakeClient {
  static fail = null;
  static startGate = null;
  static instances = [];

  constructor(options) {
    this.options = options;
    this.opened = [];
    this.changed = [];
    this.closed = [];
    this.disposed = false;
    FakeClient.instances.push(this);
  }

  async start() {
    if (FakeClient.startGate) await FakeClient.startGate;
    if (FakeClient.fail) throw FakeClient.fail;
  }

  openDocument(path, languageId, text) {
    this.opened.push({ path, languageId, text });
  }

  changeDocument(path, text) {
    this.changed.push({ path, text });
  }

  closeDocument(path) {
    this.closed.push(path);
  }

  async dispose() {
    this.disposed = true;
  }

  emit(path, diagnostics, version = null) {
    this.options.onDiagnostics(path, diagnostics, version);
  }
}

function writeSettings(lsp) {
  writeFileSync(join(agentDir, "omp-web-settings.json"), JSON.stringify({ lsp }), "utf8");
  // A fresh agent dir per test means the settings cache never serves stale data.
}

function fakeSettings() {
  return {
    enabled: true,
    servers: [
      { id: "fake", languages: ["plaintext"], command: "fake-ls", args: ["--stdio"] },
    ],
  };
}

function tempRoot(name) {
  const root = mkdtempSync(join(tmpdir(), `omp-lsp-${name}-`));
  created.push(root);
  return root;
}

beforeEach(() => {
  previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  agentDir = mkdtempSync(join(tmpdir(), "omp-lsp-settings-"));
  process.env.PI_CODING_AGENT_DIR = agentDir;
  FakeClient.fail = null;
  FakeClient.startGate = null;
  FakeClient.instances = [];
  setLspClientFactory((options) => new FakeClient(options));
});

afterEach(() => {
  disposeLsp();
  setLspClientFactory(null);
  jest.useRealTimers();
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  rmSync(agentDir, { recursive: true, force: true });
  for (const root of created) rmSync(root, { recursive: true, force: true });
  created = [];
});

test("opens a document once and sends didChange on the next open", async () => {
  writeSettings(fakeSettings());
  const root = tempRoot("open");
  const path = join(root, "notes.txt");

  const first = await openLspDocument({ root, path, languageId: "plaintext", text: "one" });
  assert.deepEqual(first, { ok: true, server: "fake", version: 1 });

  const second = await openLspDocument({ root, path, languageId: "plaintext", text: "two" });
  assert.deepEqual(second, { ok: true, server: "fake", version: 2 });

  const client = FakeClient.instances[0];
  assert.equal(FakeClient.instances.length, 1);
  assert.deepEqual(client.opened.map((entry) => entry.text), ["one"]);
  assert.deepEqual(client.changed.map((entry) => entry.text), ["two"]);
});

test("change requires an open document and bumps the version", async () => {
  writeSettings(fakeSettings());
  const root = tempRoot("change");
  const path = join(root, "notes.txt");

  assert.deepEqual(changeLspDocument({ root, path, text: "x" }), {
    ok: false,
    reason: "document_not_open",
  });

  await openLspDocument({ root, path, languageId: "plaintext", text: "one" });
  assert.deepEqual(changeLspDocument({ root, path, text: "two" }), {
    ok: true,
    server: "fake",
    version: 2,
  });
  assert.deepEqual(FakeClient.instances[0].changed, [{ path: resolve(path), text: "two" }]);
});

test("diagnostics fan out to subscribers and the snapshot, and close clears them", async () => {
  writeSettings(fakeSettings());
  const root = tempRoot("diagnostics");
  const path = join(root, "notes.txt");
  await openLspDocument({ root, path, languageId: "plaintext", text: "one" });

  const updates = [];
  const unsubscribe = subscribeLsp(root, (update) => updates.push(update));
  const diagnostic = {
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
    message: "bad",
    severity: 1,
  };
  FakeClient.instances[0].emit(path, [diagnostic], 1);

  assert.deepEqual(updates, [
    { root: resolve(root), path: resolve(path), diagnostics: [diagnostic], version: 1 },
  ]);
  assert.deepEqual(getLspDiagnostics(root, path), {
    available: true,
    server: "fake",
    diagnostics: [diagnostic],
    version: 1,
  });

  closeLspDocument({ root, path });
  assert.deepEqual(updates[1], {
    root: resolve(root),
    path: resolve(path),
    diagnostics: [],
    version: 0,
  });
  assert.deepEqual(getLspDiagnostics(root, path), {
    available: false,
    server: null,
    diagnostics: [],
    version: null,
  });
  assert.deepEqual(FakeClient.instances[0].closed, [resolve(path)]);
  unsubscribe();
});

test("unsupported languages never spawn a client", async () => {
  writeSettings(fakeSettings());
  const root = tempRoot("unsupported");
  const result = await openLspDocument({
    root,
    path: join(root, "x.unknown"),
    languageId: "unknown-lang",
    text: "",
  });
  assert.deepEqual(result, { ok: false, reason: "unsupported_language" });
  assert.equal(FakeClient.instances.length, 0);
});

test("a failed start is cached for the retry window", async () => {
  writeSettings(fakeSettings());
  FakeClient.fail = new Error("boom");
  const root = tempRoot("failure");
  const path = join(root, "notes.txt");

  const first = await openLspDocument({ root, path, languageId: "plaintext", text: "one" });
  assert.equal(first.ok, false);
  assert.equal(first.reason, "server_failed");
  assert.match(first.error, /boom/);

  FakeClient.fail = null;
  const second = await openLspDocument({ root, path, languageId: "plaintext", text: "one" });
  assert.equal(second.ok, false);
  assert.equal(second.reason, "server_failed");
  assert.equal(FakeClient.instances.length, 1);
});

test("enforces the per-root document limit", async () => {
  writeSettings(fakeSettings());
  const root = tempRoot("docs");
  for (let index = 0; index < 200; index += 1) {
    const result = await openLspDocument({
      root,
      path: join(root, `file-${index}.txt`),
      languageId: "plaintext",
      text: "",
    });
    assert.equal(result.ok, true);
  }
  const overflow = await openLspDocument({
    root,
    path: join(root, "overflow.txt"),
    languageId: "plaintext",
    text: "",
  });
  assert.deepEqual(overflow.ok, false);
  assert.equal(overflow.reason, "document_limit");
});

test("enforces the root limit when every root still has documents", async () => {
  writeSettings(fakeSettings());
  for (let index = 0; index < 4; index += 1) {
    const root = tempRoot(`root-${index}`);
    const result = await openLspDocument({
      root,
      path: join(root, "notes.txt"),
      languageId: "plaintext",
      text: "",
    });
    assert.equal(result.ok, true);
  }
  const extra = tempRoot("root-extra");
  const overflow = await openLspDocument({
    root: extra,
    path: join(extra, "notes.txt"),
    languageId: "plaintext",
    text: "",
  });
  assert.equal(overflow.ok, false);
  assert.equal(overflow.reason, "root_limit");
});

test("disposes an idle root after the last document closes", async () => {
  jest.useFakeTimers();
  writeSettings(fakeSettings());
  const root = tempRoot("idle");
  const path = join(root, "notes.txt");
  await openLspDocument({ root, path, languageId: "plaintext", text: "one" });
  const client = FakeClient.instances[0];

  closeLspDocument({ root, path });
  assert.equal(client.disposed, false);
  jest.advanceTimersByTime(LSP_IDLE_MS);
  assert.equal(client.disposed, true);
  assert.deepEqual(getLspDiagnostics(root, path), {
    available: false,
    server: null,
    diagnostics: [],
    version: null,
  });
});

test("a close during the first open does not adopt the document", async () => {
  writeSettings(fakeSettings());
  const root = tempRoot("close-race");
  const path = join(root, "notes.txt");

  let release;
  FakeClient.startGate = new Promise((resolveGate) => {
    release = resolveGate;
  });
  const opening = openLspDocument({ root, path, languageId: "plaintext", text: "one" });
  closeLspDocument({ root, path });
  release();

  assert.deepEqual(await opening, { ok: false, reason: "document_not_open" });
  assert.deepEqual(FakeClient.instances[0].opened, []);
  assert.deepEqual(getLspDiagnostics(root, path), {
    available: false,
    server: null,
    diagnostics: [],
    version: null,
  });
});

test("a changed server definition spawns a fresh client and clears its failure cache", async () => {
  writeSettings(fakeSettings());
  FakeClient.fail = new Error("boom");
  const root = tempRoot("definition");
  const first = await openLspDocument({
    root,
    path: join(root, "a.txt"),
    languageId: "plaintext",
    text: "one",
  });
  assert.equal(first.ok, false);
  assert.equal(first.reason, "server_failed");

  FakeClient.fail = null;
  saveWebServerSettings({
    lsp: {
      enabled: true,
      servers: [{ id: "fake", languages: ["plaintext"], command: "fake-ls-v2", args: [] }],
    },
  });
  const second = await openLspDocument({
    root,
    path: join(root, "b.txt"),
    languageId: "plaintext",
    text: "two",
  });
  assert.equal(second.ok, true);
  assert.equal(FakeClient.instances.length, 2);
  assert.deepEqual(FakeClient.instances[1].options.candidates, [{ command: "fake-ls-v2", args: [] }]);
});
