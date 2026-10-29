import assert from "node:assert/strict";
import { test } from "bun:test";

const { crossOriginRejection } = await import("./cross-origin.ts");

const REJECTION = {
  status: 403,
  contentType: "application/json",
  body: {
    error: "Cross-origin API requests are not allowed",
    code: "cross_origin_forbidden",
  },
};

function request(method, headers) {
  return new Request("http://127.0.0.1:30178/api/omp-update", { method, headers });
}

test("rejects cross-origin browser writes with the dispatcher payload", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const byOrigin = crossOriginRejection(method, request(method, {
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site",
    }));
    const byFetchSite = crossOriginRejection(method, request(method, {
      "sec-fetch-site": "cross-site",
    }));
    assert.deepEqual(byOrigin, REJECTION);
    assert.deepEqual(byFetchSite, REJECTION);
    assert.equal(
      JSON.stringify(byOrigin.body),
      '{"error":"Cross-origin API requests are not allowed","code":"cross_origin_forbidden"}',
    );
  }
});

test("does not origin-check GET, HEAD, or clients that send neither header", () => {
  const hostile = { origin: "https://attacker.example", "sec-fetch-site": "cross-site" };
  assert.equal(crossOriginRejection("GET", request("GET", hostile)), null);
  assert.equal(crossOriginRejection("HEAD", request("HEAD", hostile)), null);
  assert.equal(crossOriginRejection("POST", request("POST")), null);
  assert.equal(crossOriginRejection("PUT", request("PUT")), null);
  assert.equal(crossOriginRejection("PATCH", request("PATCH")), null);
  assert.equal(crossOriginRejection("DELETE", request("DELETE")), null);
});

test("keeps the existing same-origin and stripped-port allowances", () => {
  assert.equal(crossOriginRejection("POST", request("POST", {
    host: "127.0.0.1:30178",
    origin: "http://127.0.0.1:30178",
    "sec-fetch-site": "same-origin",
  })), null);
  assert.equal(crossOriginRejection("POST", request("POST", {
    host: "127.0.0.1:30177",
    origin: "http://127.0.0.1",
    "sec-fetch-site": "same-origin",
  })), null);
  assert.deepEqual(crossOriginRejection("DELETE", request("DELETE", {
    host: "127.0.0.1:30177",
    origin: "http://127.0.0.1:9999",
    "sec-fetch-site": "cross-site",
  })), REJECTION);
});
