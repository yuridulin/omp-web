import assert from "node:assert/strict";
import { test } from "bun:test";

const {
  SESSION_LIST_PREFIX_BYTES,
  scanSessionInfo,
  scanTailMessage,
  statusFromTailMessage,
  parseSessionListHeader,
  extractFirstDisplayMessageFromPrefix,
  extractStringProperty,
  firstUserMessageFromLines,
} = await import("./session-list.ts");

const modified = new Date("2026-01-02T00:00:00.000Z");
const header = { type: "session", version: 3, id: "s1", cwd: "/repo", timestamp: "2026-01-01T00:00:00.000Z", title: "Header title" };
const jsonl = (...records) => records.map((record) => JSON.stringify(record)).join("\n") + "\n";
const user = (id, content) => ({ type: "message", id, parentId: null, timestamp: "2026-01-01T00:00:01.000Z", message: { role: "user", content } });
const assistant = (id, extra = {}) => ({ type: "message", id, parentId: null, timestamp: "2026-01-01T00:00:02.000Z", message: { role: "assistant", provider: "p", model: "m", content: [{ type: "text", text: "done" }], ...extra } });

function scan(prefix, suffix = "", extra = {}) {
  return scanSessionInfo({
    path: "/sessions/s1.jsonl",
    prefix,
    suffix,
    size: prefix.length + suffix.length,
    modified,
    withStatus: true,
    ...extra,
  });
}

test("reads the header and lets a title slot override the stale header title", () => {
  const plain = scan(jsonl(header, user("u1", "hello")));
  assert.equal(plain.id, "s1");
  assert.equal(plain.cwd, "/repo");
  assert.equal(plain.title, "Header title");
  assert.equal(plain.firstMessage, "hello");
  assert.equal(plain.messageCount, 1);
  assert.deepEqual(plain.created, new Date("2026-01-01T00:00:00.000Z"));
  assert.equal(plain.modified, modified);
  assert.equal(plain.status, "unknown", "no tail window");

  const titled = scan(jsonl({ type: "title", v: 1, title: "Slot title", updatedAt: "t", pad: "" }, header, user("u1", "hello")));
  assert.equal(titled.title, "Slot title");
});

test("an empty title slot suppresses the header's title", () => {
  const scanned = scan(jsonl({ type: "title", v: 1, title: "  ", updatedAt: "t", pad: "" }, header));
  assert.equal(scanned.title, undefined);
});

test("a header line cut by the prefix window is recovered by a raw-text scan", () => {
  // Prefix ends inside the session header's JSON, so JSON.parse cannot see it.
  const cut = `${JSON.stringify({ type: "title", v: 1, title: "Slot", updatedAt: "t", pad: "" })}\n{"type":"session","version":3,"id":"cut","cwd":"/repo","timestamp":"2026-01-01T00:00:00.000Z","title":"Hea`;
  const scanned = scan(cut);
  assert.equal(scanned.id, "cut");
  assert.equal(scanned.cwd, "/repo");
  assert.equal(scanned.title, "Slot");

  const noSlot = scan('{"type":"session","version":3,"id":"n2","cwd":"/x","timestamp":"2026-01-01T00:00:00.000Z","title":"Ti');
  assert.equal(noSlot.id, "n2");
  assert.equal(noSlot.title, "Ti");
});

test("a compaction short summary titles an untitled session", () => {
  const scanned = scan(jsonl(header, { type: "compaction", id: "c", parentId: null, summary: "long", shortSummary: "short", firstKeptEntryId: "c", tokensBefore: 1 }));
  assert.equal(scanned.title, "Header title");
  const untitled = scan(jsonl({ ...header, title: undefined }, { type: "compaction", id: "c", parentId: null, summary: "long", shortSummary: "short", firstKeptEntryId: "c", tokensBefore: 1 }));
  assert.equal(untitled.title, "short");
});

test("message count is a prefix lower bound and survives truncated lines", () => {
  const content = `${JSON.stringify(header)}\n${JSON.stringify(user("u1", "one"))}\n{"type":"message","id":"u2","message":{"role":"user","content":"two`;
  const scanned = scan(content);
  assert.equal(scanned.messageCount, 2, "the cut-off third entry still counts as a message marker");
  assert.equal(scanned.firstMessage, "one");
});

test("the first user message falls back to a full-file scan only when the prefix lacks one", () => {
  let scans = 0;
  const scanFallback = () => { scans += 1; return "deep prompt"; };
  const early = scan(jsonl(header, user("u1", "early")), "", { scanFirstUserMessage: scanFallback });
  assert.equal(early.firstMessage, "early");
  assert.equal(scans, 0);

  const prefix = `${JSON.stringify(header)}\n{"type":"message","id":"d1","message":{"role":"developer","content":"rules"}}\n`;
  const deep = scanSessionInfo({ path: "/s", prefix, size: 10_000, modified, scanFirstUserMessage: scanFallback });
  assert.equal(deep.firstMessage, "deep prompt");
  assert.equal(scans, 1);

  const truncated = scanSessionInfo({ path: "/s", prefix, size: 10_000, modified, scanFirstUserMessage: () => "x".repeat(10_000) });
  assert.equal(truncated.firstMessage.length, SESSION_LIST_PREFIX_BYTES);
});

test("without any message the list uses the placeholder", () => {
  assert.equal(scan(jsonl(header)).firstMessage, "(no messages)");
  assert.equal(scan(jsonl(header), "", { scanFirstUserMessage: () => "" }).firstMessage, "(no messages)");
});

test("a developer or assistant message is shown when the prefix has no user prompt", () => {
  const content = jsonl(header, { type: "message", id: "d", message: { role: "developer", content: "system rules" } });
  assert.equal(scan(content).firstMessage, "system rules");
  assert.equal(extractFirstDisplayMessageFromPrefix(content), "system rules");
  assert.equal(extractFirstDisplayMessageFromPrefix(""), undefined);
});

test("tail status reflects the last message entry and its timestamp", () => {
  const tail = (...records) => scan(jsonl(header), jsonl(...records)).status;
  assert.equal(tail(user("u1", "hi")), "pending");
  assert.equal(tail(assistant("a1")), "complete");
  assert.equal(tail(assistant("a1", { stopReason: "error" })), "error");
  assert.equal(tail(assistant("a1", { stopReason: "aborted" })), "aborted");
  assert.equal(tail(assistant("a1", { stopReason: "length" })), "interrupted");
  assert.equal(tail(assistant("a1", { stopReason: "toolUse" })), "complete");
  assert.equal(tail(assistant("a1", { stopReason: "stop", content: [{ type: "toolCall", toolCallId: "t", toolName: "x", input: {} }] })), "interrupted");
  assert.equal(tail({ type: "message", id: "t", message: { role: "toolResult", content: [] } }), "interrupted");
  assert.equal(tail({ type: "message", id: "x", message: { role: "custom" } }), "unknown");
  assert.equal(tail({ type: "model_change", id: "m" }), "unknown", "non-message entries are skipped");

  const scanned = scan(jsonl(header), jsonl(assistant("a1")));
  assert.deepEqual(scanned.lastMessageAt, new Date("2026-01-01T00:00:02.000Z"));
});

test("a tail window starting mid-line and carrying torn/invalid timestamps is tolerated", () => {
  assert.deepEqual(scanTailMessage("message\":{\"role\":\"user\"}}\nnot json\n"), { status: "unknown" });
  const invalid = scanTailMessage(`${JSON.stringify({ type: "message", timestamp: "nope", message: { role: "user" } })}\n`);
  assert.equal(invalid.status, "pending");
  assert.equal(invalid.lastMessageAt, undefined);
  assert.deepEqual(scanTailMessage(""), { status: "unknown" });
});

test("statusFromTailMessage is total over unknown roles", () => {
  assert.equal(statusFromTailMessage({}), "unknown");
  assert.equal(statusFromTailMessage({ role: "assistant" }), "complete");
});

test("CRLF files and missing headers are handled", () => {
  const crlf = `${JSON.stringify(header)}\r\n${JSON.stringify(user("u1", "hi"))}\r\n`;
  assert.equal(parseSessionListHeader(crlf, []).id, "s1");
  assert.equal(scan(crlf).firstMessage, "hi");
  assert.equal(scan("not a session\n"), undefined);
  assert.equal(scan(""), undefined);
});

test("extractStringProperty decodes escapes and truncation", () => {
  assert.equal(extractStringProperty('{"a":"x\\ny"}', "a"), "x\ny");
  assert.equal(extractStringProperty('{"a":"unterminated', "a"), "unterminated");
  assert.equal(extractStringProperty('{"a":5}', "a"), undefined);
  assert.equal(extractStringProperty('{"a":  "spaced"}', "a"), "spaced");
  assert.equal(extractStringProperty("{}", "missing"), undefined);
});

test("the full-file fallback understands user messages and skill prompts", () => {
  const lines = [
    JSON.stringify({ type: "message", message: { role: "assistant", content: [{ type: "text", text: "no" }] } }),
    JSON.stringify({ type: "message", message: { role: "user", content: [{ type: "text", text: "first" }, { type: "text", text: "prompt" }] } }),
  ];
  assert.equal(firstUserMessageFromLines(lines), "first prompt");
  assert.equal(firstUserMessageFromLines([]), "");
  assert.equal(firstUserMessageFromLines([
    JSON.stringify({ type: "custom_message", customType: "skill-prompt", content: "Skill body\nUser: do the thing" }),
  ]), "do the thing");
  assert.equal(firstUserMessageFromLines([
    JSON.stringify({ type: "custom_message", customType: "skill-prompt", content: 'User invoked the "deploy" skill' }),
  ]), "Skill: deploy");
  assert.equal(firstUserMessageFromLines(["torn {"]), "");
});
