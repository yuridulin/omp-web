import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import { startServer } from "./index.ts";
import { resolveStaticTarget, serveStatic } from "./static.ts";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "omp-static-"));
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "index.html"), "<!doctype html><div id=root></div>");
  writeFileSync(join(root, "assets", "app-abc123.js"), "console.log('ok');");
  return root;
}

test("maps client routes to the SPA shell and hashed assets to files", () => {
  const root = fixture();
  try {
    assert.equal(resolveStaticTarget(root, "/")?.file, join(root, "index.html"));
    assert.equal(resolveStaticTarget(root, "/sessions/abc")?.file, join(root, "index.html"));
    const asset = resolveStaticTarget(root, "/assets/app-abc123.js");
    assert.equal(asset?.file, join(root, "assets", "app-abc123.js"));
    assert.equal(asset?.immutable, true);
    assert.equal(resolveStaticTarget(root, "/assets/missing.js"), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects traversal and unknown extensions", () => {
  const root = fixture();
  try {
    assert.equal(resolveStaticTarget(root, "/../secret.txt"), null);
    assert.equal(resolveStaticTarget(root, "/%2e%2e/secret.txt"), null);
    assert.equal(resolveStaticTarget(root, "/missing.txt"), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("serves files with cache headers and leaves API paths alone", async () => {
  const root = fixture();
  try {
    const page = await serveStatic(root, new Request("http://127.0.0.1/"));
    assert.equal(page?.status, 200);
    assert.equal(page?.headers.get("cache-control"), "no-cache");
    assert.match(await page.text(), /id=root/);

    const asset = await serveStatic(root, new Request("http://127.0.0.1/assets/app-abc123.js"));
    assert.equal(asset?.status, 200);
    assert.match(asset?.headers.get("content-type") ?? "", /javascript/);
    assert.match(asset?.headers.get("cache-control") ?? "", /immutable/);

    const head = await serveStatic(root, new Request("http://127.0.0.1/", { method: "HEAD" }));
    assert.equal(head?.status, 200);
    assert.equal(await head.text(), "");

    assert.equal(await serveStatic(root, new Request("http://127.0.0.1/api/version")), null);
    assert.equal(await serveStatic(root, new Request("http://127.0.0.1/assets/missing.js")), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the started server serves the UI and keeps /api JSON", async () => {
  const root = fixture();
  const { server, url } = await startServer({ host: "127.0.0.1", port: 0, staticRoot: root });
  try {
    const page = await fetch(new URL("/", url));
    assert.equal(page.status, 200);
    assert.match(await page.text(), /id=root/);

    const route = await fetch(new URL("/workbench/session-1", url));
    assert.equal(route.status, 200);
    assert.match(await route.text(), /id=root/);

    const api = await fetch(new URL("/api/does-not-exist", url));
    assert.equal(api.status, 404);
    assert.equal((await api.json()).code, "not_found");
  } finally {
    await server.stop(true);
    rmSync(root, { recursive: true, force: true });
  }
});
