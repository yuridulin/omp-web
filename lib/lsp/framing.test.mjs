import assert from "node:assert/strict";
import { test } from "bun:test";
import {
  createLspParser,
  encodeLspMessage,
  LspProtocolError,
  LSP_MAX_MESSAGE_BYTES,
} from "./framing.ts";

function collect(chunks) {
  const messages = [];
  const feed = createLspParser((message) => messages.push(message));
  for (const chunk of chunks) feed(Buffer.from(chunk, "utf8"));
  return messages;
}

test("round-trips a framed message", () => {
  const frame = encodeLspMessage({ jsonrpc: "2.0", id: 1, method: "initialize" });
  const messages = collect([frame]);
  assert.deepEqual(messages, [{ jsonrpc: "2.0", id: 1, method: "initialize" }]);
});

test("frames multiple messages and split chunks", () => {
  const first = encodeLspMessage({ id: 1 });
  const second = encodeLspMessage({ id: 2 });
  const combined = Buffer.concat([first, second]);
  const messages = [];
  const feed = createLspParser((message) => messages.push(message));
  for (const byte of combined) feed(Buffer.from([byte]));
  assert.deepEqual(messages, [{ id: 1 }, { id: 2 }]);
});

test("accepts a lowercase content-length header", () => {
  const messages = collect(["content-length: 2\r\n\r\n{}"]);
  assert.deepEqual(messages, [{}]);
});

test("throws when content-length is missing", () => {
  const feed = createLspParser(() => {});
  assert.throws(() => feed(Buffer.from("Content-Type: application/json\r\n\r\n{}")), LspProtocolError);
});

test("throws on invalid json", () => {
  const feed = createLspParser(() => {});
  assert.throws(() => feed(Buffer.from("Content-Length: 3\r\n\r\nnope")), LspProtocolError);
});

test("rejects an oversized body before buffering it", () => {
  const feed = createLspParser(() => {});
  assert.throws(
    () => feed(Buffer.from(`Content-Length: ${LSP_MAX_MESSAGE_BYTES + 1}\r\n\r\n`)),
    LspProtocolError,
  );
});

test("rejects a non-numeric length", () => {
  const feed = createLspParser(() => {});
  assert.throws(() => feed(Buffer.from("Content-Length: abc\r\n\r\n")), LspProtocolError);
});
