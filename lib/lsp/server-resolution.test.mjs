import assert from "node:assert/strict";
import { test } from "bun:test";
import { resolveLspServer } from "./server-resolution.ts";

function settings(servers = [], enabled = true) {
  return { enabled, servers };
}

function which(map) {
  return (name) => map[name] ?? null;
}

test("disabled settings never resolve a server", () => {
  assert.deepEqual(resolveLspServer("typescript", settings([], false)), {
    ok: false,
    reason: "disabled",
  });
});

test("unsupported languages report unsupported_language", () => {
  assert.deepEqual(resolveLspServer("plaintext", settings()), {
    ok: false,
    reason: "unsupported_language",
  });
});

test("typescript resolves the bundled CLI through Bun first, then node", () => {
  const result = resolveLspServer("typescript", settings(), {
    which: which({ node: "/usr/bin/node" }),
    resolveTypescriptCli: () => "/pkg/lib/cli.mjs",
  });
  assert.equal(result.ok, true);
  assert.equal(result.id, "typescript");
  assert.deepEqual(result.candidates, [
    { command: process.execPath, args: ["/pkg/lib/cli.mjs", "--stdio"] },
    { command: "/usr/bin/node", args: ["/pkg/lib/cli.mjs", "--stdio"] },
  ]);
});

test("javascript shares the typescript preset", () => {
  const result = resolveLspServer("javascript", settings(), {
    which: which({}),
    resolveTypescriptCli: () => "/pkg/lib/cli.mjs",
  });
  assert.equal(result.ok, true);
  assert.equal(result.id, "typescript");
});

test("falls back to a PATH typescript-language-server", () => {
  const result = resolveLspServer("typescript", settings(), {
    which: which({ "typescript-language-server": "/bin/tls" }),
    resolveTypescriptCli: () => null,
  });
  assert.deepEqual(result, {
    ok: true,
    id: "typescript",
    candidates: [{ command: "/bin/tls", args: ["--stdio"] }],
  });
});

test("missing typescript server reports an install hint", () => {
  const result = resolveLspServer("typescript", settings(), {
    which: which({}),
    resolveTypescriptCli: () => null,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing_server");
  assert.match(result.hint, /typescript-language-server/);
});

test("a user definition overrides a built-in preset", () => {
  const result = resolveLspServer(
    "TypeScript",
    settings([
      {
        id: "typescript",
        languages: ["typescript"],
        command: "custom-ls",
        args: ["--stdio"],
        env: { FOO: "1" },
      },
    ]),
    { which: which({ "typescript-language-server": "/bin/tls" }), resolveTypescriptCli: () => null },
  );
  assert.deepEqual(result, {
    ok: true,
    id: "typescript",
    candidates: [{ command: "custom-ls", args: ["--stdio"] }],
    env: { FOO: "1" },
  });
});

test("a non-matching user server falls through to the preset", () => {
  const result = resolveLspServer(
    "javascript",
    settings([{ id: "other", languages: ["python"], command: "py-ls", args: [] }]),
    { which: which({ "typescript-language-server": "/bin/tls" }), resolveTypescriptCli: () => null },
  );
  assert.equal(result.ok, true);
  assert.equal(result.id, "typescript");
});

test("csharp prefers csharp-ls, then omnisharp", () => {
  const csharpLs = resolveLspServer("csharp", settings(), {
    which: which({ "csharp-ls": "/bin/csharp-ls", omnisharp: "/bin/omnisharp" }),
    resolveTypescriptCli: () => null,
  });
  assert.deepEqual(csharpLs, {
    ok: true,
    id: "csharp",
    candidates: [{ command: "/bin/csharp-ls", args: [] }],
  });

  const omnisharp = resolveLspServer("csharp", settings(), {
    which: which({ omnisharp: "/bin/omnisharp" }),
    resolveTypescriptCli: () => null,
  });
  assert.deepEqual(omnisharp, {
    ok: true,
    id: "csharp",
    candidates: [{ command: "/bin/omnisharp", args: ["--languageserver"] }],
  });
});

test("missing csharp server suggests dotnet tool install", () => {
  const result = resolveLspServer("csharp", settings(), {
    which: which({}),
    resolveTypescriptCli: () => null,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing_server");
  assert.match(result.hint, /csharp-ls/);
});
