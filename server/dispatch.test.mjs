import assert from "node:assert/strict";
import { Writable } from "node:stream";
import test from "node:test";
import { createJiti } from "jiti";

const { matchRoute, selectRoute, dispatch } = await createJiti(import.meta.url, {
  tsconfigPaths: true,
}).import("./index.ts");

function createRequest(url, method = "GET") {
  return {
    url,
    method,
    headers: { host: "127.0.0.1:30178" },
    on() {
      return this;
    },
  };
}

function isHeaderBag(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function createResponse() {
  const chunks = [];
  const headers = new Map();
  const response = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk, encoding) : Buffer.from(chunk));
      callback();
    },
  });
  response.statusCode = 0;
  response.headersSent = false;
  response.setHeader = (name, value) => {
    headers.set(String(name).toLowerCase(), value);
    return response;
  };
  response.writeHead = (statusCode, second, third) => {
    response.statusCode = statusCode;
    response.headersSent = true;
    const bag = isHeaderBag(third) ? third : (isHeaderBag(second) ? second : null);
    if (bag) {
      for (const [name, value] of Object.entries(bag)) headers.set(name.toLowerCase(), value);
    }
    return response;
  };
  const finished = new Promise((resolve, reject) => {
    response.on("finish", () => resolve(Buffer.concat(chunks)));
    response.on("error", reject);
  });
  return { response, headers, finished };
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
    { segments: ["sessions", "[id]"], file: "by-id" },
    { segments: ["sessions", "archive"], file: "archive" },
  ];
  assert.deepEqual(matchRoute(["sessions", "[id]"], ["sessions", "archive"]), { id: "archive" });
  assert.deepEqual(matchRoute(["sessions", "archive"], ["sessions", "archive"]), {});

  const selected = selectRoute(routes, ["sessions", "archive"]);
  assert.ok(selected);
  assert.deepEqual(selected.route.segments, ["sessions", "archive"]);

  let loaded = "";
  const { response, finished } = createResponse();
  await dispatch(createRequest("/api/sessions/archive"), response, routes, (file) => {
    loaded = file;
    return { GET: () => Response.json({ file }) };
  });
  const bytes = await finished;
  assert.equal(loaded, "archive");
  assert.equal(response.statusCode, 200);
  assert.deepEqual(bytes, Buffer.from(JSON.stringify({ file: "archive" })));
});

test("unknown path responds 404 and does not call a handler", async () => {
  let calls = 0;
  const { response, headers, finished } = createResponse();
  await dispatch(
    createRequest("/api/does-not-exist"),
    response,
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
  const bytes = await finished;
  assert.equal(calls, 0);
  assert.equal(response.statusCode, 404);
  assert.equal(headers.get("content-type"), "application/json");
  assert.deepEqual(bytes, Buffer.from(JSON.stringify({ error: "Not found", code: "not_found" })));
});

test("unexported method responds 405 with Allow and does not call a handler", async () => {
  let calls = 0;
  const { response, headers, finished } = createResponse();
  await dispatch(
    createRequest("/api/sessions/archive", "POST"),
    response,
    [{ segments: ["sessions", "archive"], file: "archive" }],
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
  const bytes = await finished;
  assert.equal(calls, 0);
  assert.equal(response.statusCode, 405);
  assert.equal(headers.get("content-type"), "application/json");
  const allow = String(headers.get("allow")).split(",").map((part) => part.trim());
  assert.ok(allow.includes("GET"));
  assert.ok(allow.includes("PUT"));
  assert.deepEqual(bytes, Buffer.from(JSON.stringify({
    error: "Method not allowed",
    code: "method_not_allowed",
  })));
});

test("matching GET pipes Response.json body bytes", async () => {
  const { response, headers, finished } = createResponse();
  await dispatch(
    createRequest("/api/ping"),
    response,
    [{ segments: ["ping"], file: "ping" }],
    () => ({
      GET() {
        return Response.json({ ok: true });
      },
    }),
  );
  const bytes = await finished;
  assert.equal(response.statusCode, 200);
  assert.equal(headers.get("content-type"), "application/json");
  assert.deepEqual(bytes, Buffer.from(JSON.stringify({ ok: true })));
});
