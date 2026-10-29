import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "bun:test";

const { allowFileRoot } = await import("../lib/file-access.ts");
const { collectRoutes, dispatch } = await import("./index.ts");

const routes = collectRoutes();

function fileUrl(filePath) {
  const segments = filePath.split(/[\\/]/).filter(Boolean).map(encodeURIComponent);
  return `/api/workspace/files/${segments.join("/")}`;
}

function request(url, method, body) {
  return new Request(`http://127.0.0.1:30178${url}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          body: typeof body === "string" ? body : JSON.stringify(body),
          headers: { "content-type": "application/json" },
        }),
  });
}

async function call(url, method, body) {
  const response = await dispatch(request(url, method, body), routes);
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

test("file routes write, rename, and delete through the contract-validated dispatcher", async () => {
  const dir = mkdtempSync(join(tmpdir(), "omp-workspace-routes-"));
  allowFileRoot(dir);
  const original = join(dir, "notes.txt");
  const renamed = join(dir, "renamed.txt");
  try {
    const written = await call(fileUrl(original), "PUT", { content: "hello\n" });
    assert.equal(written.status, 200);
    assert.equal(readFileSync(original, "utf8"), "hello\n");
    assert.equal(written.body.bytes, 6);

    const moved = await call(fileUrl(original), "PATCH", { to: renamed });
    assert.equal(moved.status, 200);
    assert.equal(existsSync(original), false);
    assert.equal(existsSync(renamed), true);

    const deleted = await call(fileUrl(renamed), "DELETE");
    assert.equal(deleted.status, 200);
    assert.equal(existsSync(renamed), false);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("malformed and schema-invalid bodies stop at the boundary", async () => {
  const dir = mkdtempSync(join(tmpdir(), "omp-workspace-invalid-"));
  allowFileRoot(dir);
  try {
    const malformed = await call(fileUrl(join(dir, "a.txt")), "PUT", "{");
    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.code, "invalid_json");

    const missingContent = await call(fileUrl(join(dir, "a.txt")), "PUT", {});
    assert.equal(missingContent.status, 400);
    assert.equal(missingContent.body.code, "invalid_request");
    assert.ok(Array.isArray(missingContent.body.details));
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("writes outside every allowed root are refused", async () => {
  const dir = mkdtempSync(join(tmpdir(), "omp-workspace-denied-"));
  const outside = join(dirname(process.cwd()), "omp-workspace-outside.txt");
  try {
    const response = await call(fileUrl(outside), "PUT", { content: "nope" });
    assert.equal(response.status, 403);
    assert.equal(response.body.code, "access_denied");
    assert.equal(existsSync(outside), false);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("the generated route table exposes the domain paths", () => {
  const paths = routes.map((route) => `/${route.segments.join("/")}`);
  assert.ok(paths.includes("/agent/sessions/[id]/intent"));
  assert.ok(paths.includes("/workspace/git/stage"));
  assert.ok(paths.includes("/system/home"));
  assert.equal(paths.some((path) => path.startsWith("/sessions") || path.startsWith("/files")), false);
});
