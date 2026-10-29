import assert from "node:assert/strict";
import { test } from "bun:test";

const { matchRoute, selectRoute, dispatch } = await import("./index.ts");
const { readJson } = await import("./http.ts");

function createRequest(url, method = "GET") {
  return new Request(`http://127.0.0.1:30178${url}`, { method });
}

async function bodyBytes(response) {
  return Buffer.from(await response.arrayBuffer());
}

test("[param] captures one string", () => {
  assert.deepEqual(matchRoute(["agent", "[id]"], ["agent", "abc"]), { id: "abc" });
});

test("[...catchAll] captures the rest, rejects an empty remainder, and static text matches exactly", () => {
  assert.deepEqual(matchRoute(["files", "[...path]"], ["files", "a", "b"]), { path: ["a", "b"] });
  assert.equal(matchRoute(["files", "[...path]"], ["files"]), null);
  assert.equal(matchRoute(["files", "[...path]"], ["other", "a", "b"]), null);
  assert.equal(matchRoute(["sessions", "archive"], ["sessions", "other"]), null);
});

test("higher score selects sessions/archive over sessions/[id]", async () => {
  // Dynamic route is first so a first-match walk would take it.
  const routes = [
    { segments: ["agent", "sessions", "[id]"], file: "by-id" },
    { segments: ["agent", "sessions", "archive"], file: "archive" },
  ];
  assert.deepEqual(matchRoute(["sessions", "[id]"], ["sessions", "archive"]), { id: "archive" });
  assert.deepEqual(matchRoute(["sessions", "archive"], ["sessions", "archive"]), {});

  const selected = selectRoute(routes, ["agent", "sessions", "archive"]);
  assert.ok(selected);
  assert.deepEqual(selected.route.segments, ["agent", "sessions", "archive"]);

  let loaded = "";
  const response = await dispatch(createRequest("/api/agent/sessions/archive"), routes, (file) => {
    loaded = file;
    return { GET: () => Response.json({ file }) };
  });
  assert.equal(loaded, "archive");
  assert.equal(response.status, 200);
  // `Response.json` fixtures carry Bun's charset suffix.
  assert.ok(response.headers.get("content-type").startsWith("application/json"));
  assert.deepEqual(await bodyBytes(response), Buffer.from(JSON.stringify({ file: "archive" })));
});

test("unknown path responds 404 and does not call a handler", async () => {
  let calls = 0;
  const response = await dispatch(
    createRequest("/api/does-not-exist"),
    [{ segments: ["sessions", "archive"], file: "archive" }],
    () => {
      calls += 1;
      return {
        GET() {
          calls += 1;
          return Response.json({ ok: true });
        },
      };
    },
  );
  assert.equal(calls, 0);
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.deepEqual(await bodyBytes(response), Buffer.from(JSON.stringify({
    error: "Not found",
    code: "not_found",
  })));
});

test("unexported method responds 405 with Allow and does not call a handler", async () => {
  let calls = 0;
  const response = await dispatch(
    createRequest("/api/agent/sessions/archive", "POST"),
    [{ segments: ["agent", "sessions", "archive"], file: "archive" }],
    () => ({
      GET() {
        calls += 1;
        return Response.json({ ok: true });
      },
      PUT() {
        calls += 1;
        return Response.json({ ok: true });
      },
    }),
  );
  assert.equal(calls, 0);
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("content-type"), "application/json");
  const allow = String(response.headers.get("allow")).split(",").map((part) => part.trim());
  assert.deepEqual(allow, ["GET", "HEAD", "PUT"]);
  assert.deepEqual(await bodyBytes(response), Buffer.from(JSON.stringify({
    error: "Method not allowed",
    code: "method_not_allowed",
  })));
});

test("matching GET returns the handler Response body bytes", async () => {
  const response = await dispatch(
    createRequest("/api/ping"),
    [{ segments: ["ping"], file: "ping" }],
    () => ({
      GET() {
        return Response.json({ ok: true });
      },
    }),
  );
  assert.equal(response.status, 200);
  assert.ok(response.headers.get("content-type").startsWith("application/json"));
  assert.deepEqual(await bodyBytes(response), Buffer.from(JSON.stringify({ ok: true })));
});

test("HEAD falls back to GET and returns headers without a body", async () => {
  const response = await dispatch(
    createRequest("/api/ping", "HEAD"),
    [{ segments: ["ping"], file: "ping" }],
    () => ({
      GET() {
        return Response.json({ ok: true });
      },
    }),
  );
  assert.equal(response.status, 200);
  assert.ok(response.headers.get("content-type").startsWith("application/json"));
  assert.equal((await bodyBytes(response)).length, 0);
});

test("malformed request JSON reaches the handler as a 400 invalid_json", async () => {
  const response = await dispatch(
    new Request("http://127.0.0.1:30178/api/echo", {
      method: "POST",
      body: "{",
      headers: { "content-type": "application/json" },
    }),
    [{ segments: ["echo"], file: "echo" }],
    () => ({
      async POST(request) {
        const parsed = await readJson(request);
        return parsed.ok ? Response.json(parsed.body) : parsed.response;
      },
    }),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Invalid JSON request body",
    code: "invalid_json",
  });
});
