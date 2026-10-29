import assert from "node:assert/strict";
import { test } from "bun:test";

const { safeOpenUrl } = await import("./urls.ts");

test("accepts http, https and mailto", () => {
  assert.equal(safeOpenUrl("http://example.com/a"), "http://example.com/a");
  assert.equal(safeOpenUrl("https://example.com/a?b=1#c"), "https://example.com/a?b=1#c");
  assert.equal(safeOpenUrl("mailto:dev@example.com"), "mailto:dev@example.com");
  assert.equal(safeOpenUrl("HTTPS://EXAMPLE.COM"), "HTTPS://EXAMPLE.COM");
});

test("trims surrounding whitespace and returns the trimmed url", () => {
  assert.equal(safeOpenUrl("  https://example.com/x  "), "https://example.com/x");
  assert.equal(safeOpenUrl("\nmailto:a@b.c\t"), "mailto:a@b.c");
});

test("rejects dangerous schemes", () => {
  assert.equal(safeOpenUrl("javascript:alert(1)"), null);
  assert.equal(safeOpenUrl(" JavaScript:alert(1)"), null);
  assert.equal(safeOpenUrl("data:text/html,<script>alert(1)</script>"), null);
  assert.equal(safeOpenUrl("file:///etc/passwd"), null);
  assert.equal(safeOpenUrl("vbscript:msgbox(1)"), null);
});

test("rejects protocol-relative and schemeless input", () => {
  assert.equal(safeOpenUrl("//host/path"), null);
  assert.equal(safeOpenUrl("  //host/path"), null);
  assert.equal(safeOpenUrl("no-scheme"), null);
  assert.equal(safeOpenUrl("example.com"), null);
  assert.equal(safeOpenUrl("/relative/path"), null);
});

test("rejects empty and non-string input", () => {
  assert.equal(safeOpenUrl(""), null);
  assert.equal(safeOpenUrl("   "), null);
  assert.equal(safeOpenUrl(null), null);
  assert.equal(safeOpenUrl(undefined), null);
  assert.equal(safeOpenUrl(42), null);
  assert.equal(safeOpenUrl({ url: "https://example.com" }), null);
  assert.equal(safeOpenUrl(["https://example.com"]), null);
});
