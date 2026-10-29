import assert from "node:assert/strict";
import { test } from "bun:test";

const {
  SESSION_TITLE_SLOT_BYTES,
  SUPERSEDED_COMPACTION_SUMMARY,
  buildSessionContext,
  entryToUiMessage,
  parseTitleSlotLine,
  parseTitleSlotHead,
  serializeTitleSlot,
  parseJsonlLenient,
  buildSessionTree,
  getLeafEntryId,
  normalizeToolCalls,
} = await import("./session.ts");

function userEntry(id, parentId, content, timestamp = "2026-01-01T00:00:00.000Z") {
  return { type: "message", id, parentId, timestamp, message: { role: "user", content } };
}

function assistantEntry(id, parentId, text, timestamp = "2026-01-01T00:00:00.000Z") {
  return {
    type: "message",
    id,
    parentId,
    timestamp,
    message: { role: "assistant", provider: "test", model: "test-model", content: [{ type: "text", text }] },
  };
}

test("renders the compaction-aware context with aligned entry IDs", () => {
  const entries = [
    userEntry("u1", null, "old user request"),
    assistantEntry("a1", "u1", "old assistant answer"),
    userEntry("u2", "a1", "kept user request"),
    { type: "compaction", id: "cmp", parentId: "u2", timestamp: "2026-01-01T00:00:03.000Z", summary: "old exchange summary", firstKeptEntryId: "u2", tokensBefore: 123 },
    userEntry("u3", "cmp", "after compaction"),
  ];

  const context = buildSessionContext(entries);
  assert.deepEqual(context.entryIds, ["cmp", "u2", "u3"]);
  assert.deepEqual(
    context.messages.map((message) => [message.role, message.customType, message.content]),
    [
      ["custom", "compaction", "old exchange summary"],
      ["user", undefined, "kept user request"],
      ["user", undefined, "after compaction"],
    ],
  );
});

test("can expose pre-compaction entries for read-only browsing", () => {
  const entries = [
    userEntry("u1", null, "old user request"),
    assistantEntry("a1", "u1", "old assistant answer"),
    userEntry("u2", "a1", "kept user request"),
    { type: "compaction", id: "cmp", parentId: "u2", timestamp: "2026-01-01T00:00:03.000Z", summary: "old exchange summary", firstKeptEntryId: "u2", tokensBefore: 123 },
    userEntry("u3", "cmp", "after compaction"),
  ];

  const context = buildSessionContext(entries, undefined, { includePreCompaction: true });
  assert.deepEqual(context.entryIds, ["u1", "a1", "u2", "cmp", "u3"]);
  assert.deepEqual(
    context.messages.map((message) => message.role === "custom" ? message.customType : message.content),
    ["old user request", [{ type: "text", text: "old assistant answer" }], "kept user request", "compaction", "after compaction"],
  );
});

test("uses only the latest compaction on the active path", () => {
  const entries = [
    userEntry("u1", null, "old request"),
    assistantEntry("a1", "u1", "old answer"),
    userEntry("u2", "a1", "first kept request"),
    { type: "compaction", id: "cmp1", parentId: "u2", timestamp: "2026-01-01T00:00:03.000Z", summary: "first summary", firstKeptEntryId: "u2", tokensBefore: 100 },
    assistantEntry("a2", "cmp1", "second kept answer"),
    userEntry("u3", "a2", "second kept request"),
    { type: "compaction", id: "cmp2", parentId: "u3", timestamp: "2026-01-01T00:00:06.000Z", summary: "latest summary", firstKeptEntryId: "a2", tokensBefore: 200 },
    assistantEntry("a3", "cmp2", "latest answer"),
  ];

  const context = buildSessionContext(entries);
  assert.deepEqual(context.entryIds, ["cmp2", "a2", "u3", "a3"]);
  assert.equal(context.messages[0].content, "latest summary");
  assert.equal(context.messages.length, context.entryIds.length);
});

test("uses the selected leaf's path before a later compaction", () => {
  const entries = [
    userEntry("u1", null, "root request"),
    assistantEntry("a1", "u1", "root answer"),
    userEntry("u2", "a1", "main branch"),
    { type: "compaction", id: "cmp", parentId: "u2", timestamp: "2026-01-01T00:00:03.000Z", summary: "main branch summary", firstKeptEntryId: "u2", tokensBefore: 100 },
    userEntry("alt", "a1", "alternate branch"),
  ];

  const context = buildSessionContext(entries, "alt");
  assert.deepEqual(context.entryIds, ["u1", "a1", "alt"]);
  assert.equal(context.messages.some((message) => message.role === "custom"), false);
});

test("a missing leaf falls back to the tip; a null leaf is empty", () => {
  const entries = [userEntry("u1", null, "one"), userEntry("u2", "u1", "two")];
  assert.deepEqual(buildSessionContext(entries, "missing").entryIds, ["u1", "u2"]);
  assert.deepEqual(buildSessionContext(entries, null).messages, []);
  assert.deepEqual(buildSessionContext([], undefined).entryIds, []);
});

test("reads the latest valid todo snapshot from the selected branch", () => {
  const entries = [
    userEntry("u1", null, "start"),
    {
      type: "message",
      id: "todo-main",
      parentId: "u1",
      timestamp: "2026-01-01T00:00:01.000Z",
      message: { role: "toolResult", toolName: "todo", content: [], details: { phases: [{ name: "Main", tasks: [{ content: "Keep", status: "in_progress" }] }] } },
    },
    {
      type: "custom",
      id: "todo-alt",
      parentId: "u1",
      timestamp: "2026-01-01T00:00:02.000Z",
      customType: "user_todo_edit",
      data: { phases: [{ name: "Alternate", tasks: [{ content: "Use this", status: "pending" }] }] },
    },
  ];

  assert.deepEqual(buildSessionContext(entries, "todo-alt").todoPhases, [
    { name: "Alternate", tasks: [{ content: "Use this", status: "pending" }] },
  ]);
});

test("defers historical thinking and leaves live content alone", () => {
  const entries = [
    userEntry("u1", null, "start"),
    {
      ...assistantEntry("a1", "u1", "answer"),
      message: {
        role: "assistant",
        provider: "test",
        model: "test-model",
        content: [{ type: "thinking", thinking: "large reasoning" }, { type: "text", text: "answer" }],
      },
    },
  ];

  const deferred = buildSessionContext(entries, undefined, { deferThinking: true });
  assert.deepEqual(deferred.messages[1].content[0], { type: "thinking", thinking: "", deferred: true });
  assert.equal(buildSessionContext(entries).messages[1].content[0].thinking, "large reasoning");
});

test("does not defer empty thinking and tolerates string-content assistant entries", () => {
  const empty = buildSessionContext([
    userEntry("u1", null, "start"),
    { ...assistantEntry("a1", "u1", "answer"), message: { role: "assistant", provider: "p", model: "m", content: [{ type: "thinking", thinking: "" }] } },
  ], undefined, { deferThinking: true });
  assert.deepEqual(empty.messages[1].content[0], { type: "thinking", thinking: "" });

  const legacy = buildSessionContext([
    userEntry("u1", null, "start"),
    { type: "message", id: "a1", parentId: "u1", timestamp: "2026-01-01T00:00:00.000Z", message: { role: "assistant", content: "legacy plain-text answer" } },
  ], undefined, { deferThinking: true });
  assert.equal(legacy.messages[1].content, "legacy plain-text answer");
});

test("the host maps tool-result images without touching user images", () => {
  const toolImage = { type: "image", data: "QUJDRA==", mimeType: "image/png" };
  const userImage = { type: "image", data: "QUJDRA==", mimeType: "image/png" };
  const entries = [
    userEntry("u1", null, [{ type: "text", text: "inspect" }, userImage]),
    { type: "message", id: "tr1", parentId: "u1", timestamp: "2026-01-01T00:00:01.000Z", message: { role: "toolResult", toolCallId: "call1", content: [{ type: "text", text: "read" }, toolImage] } },
  ];
  const mapImages = (message) => message.role === "toolResult"
    ? { ...message, content: message.content.map((block) => block.type === "image" ? { type: "image", url: "/api/media/abc" } : block) }
    : message;

  const mapped = buildSessionContext(entries, undefined, { toolResultImages: mapImages });
  assert.deepEqual(mapped.messages[0].content[1], userImage);
  assert.deepEqual(mapped.messages[1].content[1], { type: "image", url: "/api/media/abc" });
  assert.deepEqual(buildSessionContext(entries).messages[1].content[1], toolImage, "identity by default");
});

test("preserves hidden custom messages so a client can render them collapsed", () => {
  const context = buildSessionContext([
    userEntry("u1", null, "start"),
    { type: "custom_message", id: "c1", parentId: "u1", timestamp: "2026-01-01T00:00:01.000Z", customType: "extension_debug", content: "hidden payload", display: false, details: { source: "test" } },
    assistantEntry("a1", "c1", "done"),
  ]);
  assert.deepEqual(context.entryIds, ["u1", "c1", "a1"]);
  assert.equal(context.messages[1].customType, "extension_debug");
  assert.equal(context.messages[1].display, false);
  assert.deepEqual(context.messages[1].details, { source: "test" });
});

test("epoch timestamps survive on synthetic messages", () => {
  const context = buildSessionContext([
    userEntry("u1", null, "start"),
    { type: "compaction", id: "cmp", parentId: "u1", timestamp: "1970-01-01T00:00:00.000Z", summary: "epoch summary", firstKeptEntryId: "u1", tokensBefore: 10 },
  ]);
  assert.equal(context.messages[0].customType, "compaction");
  assert.equal(context.messages[0].timestamp, 0);
});

test("message entries without a message object are skipped, not fatal", () => {
  const entries = [
    { type: "message", id: "bad1", parentId: null, timestamp: "2026-01-01T00:00:01.000Z" },
    userEntry("u1", "bad1", "still readable"),
    { type: "message", id: "bad2", parentId: "u1", timestamp: "2026-01-01T00:00:02.000Z", message: null },
  ];
  const context = buildSessionContext(entries);
  assert.deepEqual(context.entryIds, ["u1"]);
  assert.equal(context.messages[0].role, "user");
});

test("task toolResults keep size-bounded details; other results keep only patch/diff", () => {
  const entries = [
    {
      type: "message",
      id: "t1",
      parentId: null,
      timestamp: "2026-01-01T00:00:00.000Z",
      message: {
        role: "toolResult",
        toolCallId: "tc1",
        toolName: "task",
        content: [],
        details: {
          totalDurationMs: 360000,
          progress: [{ id: "Scout", agent: "scout", status: "running", task: "Map", tokens: 100, cost: 0.001 }],
          results: [{ id: "Scout", agent: "scout", task: "Map", exitCode: 0, tokens: 999000, cost: 1.25, output: "x".repeat(5000), stderr: "err", resolvedModel: "m".repeat(5000), outputPath: "p".repeat(5000) }],
          async: { state: "completed", jobId: "Scout", type: "task", message: "x".repeat(10000) },
          agent: "a".repeat(5000),
        },
      },
    },
    {
      type: "message",
      id: "t2",
      parentId: "t1",
      timestamp: "2026-01-01T00:00:00.000Z",
      message: { role: "toolResult", toolCallId: "tc2", toolName: "edit", content: [], details: { huge: "x".repeat(10000), patch: "the patch" } },
    },
  ];
  const context = buildSessionContext(entries);
  const taskDetails = context.messages.find((message) => message.toolCallId === "tc1").details;
  assert.equal(taskDetails.results[0].tokens, 999000);
  assert.equal("output" in taskDetails.results[0], false);
  assert.equal("stderr" in taskDetails.results[0], false);
  assert.equal(taskDetails.progress[0].id, "Scout");
  assert.equal(taskDetails.async.jobId, "Scout");
  assert.equal("message" in taskDetails.async, false);
  assert.ok(taskDetails.results[0].resolvedModel.length <= 241);
  assert.ok(taskDetails.results[0].outputPath.length <= 241);
  assert.deepEqual(context.messages.find((message) => message.toolCallId === "tc2").details, { patch: "the patch" });
});

test("hub send/jobs results keep bounded roster details; other ops are stripped", () => {
  const entries = [
    {
      type: "message", id: "h1", parentId: null, timestamp: "2026-01-01T00:00:00.000Z",
      message: { role: "toolResult", toolCallId: "hc1", toolName: "hub", content: [], details: { op: "send", to: "VisualFix", receipts: [{ to: "VisualFix", outcome: "injected", extra: "x".repeat(5000) }], noise: "dropped" } },
    },
    {
      type: "message", id: "h2", parentId: "h1", timestamp: "2026-01-01T00:00:00.000Z",
      message: { role: "toolResult", toolCallId: "hc2", toolName: "hub", content: [], details: { op: "jobs", jobs: [{ id: "VisualFix", type: "task", status: "running", label: "VisualFix", durationMs: 1890000, secret: "dropped" }] } },
    },
    {
      type: "message", id: "h3", parentId: "h2", timestamp: "2026-01-01T00:00:00.000Z",
      message: { role: "toolResult", toolCallId: "hc3", toolName: "hub", content: [], details: { op: "list", peers: [], counts: { running: 0 } } },
    },
  ];
  const context = buildSessionContext(entries);
  assert.deepEqual(context.messages[0].details, { op: "send", to: ["VisualFix"], receipts: [{ to: "VisualFix", outcome: "injected" }] });
  assert.deepEqual(context.messages[1].details, { op: "jobs", jobs: [{ id: "VisualFix", type: "task", status: "running", label: "VisualFix", durationMs: 1890000 }] });
  assert.equal("details" in context.messages[2], false);
});

test("branch summaries render as non-branchable user rows", () => {
  const message = entryToUiMessage({ type: "branch_summary", id: "b1", parentId: null, timestamp: "2026-01-01T00:00:00.000Z", fromId: "x", summary: "旁支" });
  assert.equal(message.role, "user");
  assert.equal(message.branchSummary, true);
  assert.match(message.content, /旁支$/);
  assert.equal(entryToUiMessage({ type: "branch_summary", id: "b2", parentId: null, timestamp: "2026-01-01T00:00:00.000Z", fromId: "x", summary: "" }), null);
});

test("omp-only roles fold into displayable custom messages", () => {
  const developer = entryToUiMessage({ type: "message", id: "d", parentId: null, timestamp: "2026-01-01T00:00:00.000Z", message: { role: "developer", content: "steering" } });
  assert.deepEqual(
    { role: developer.role, customType: developer.customType, display: developer.display, content: developer.content },
    { role: "custom", customType: "developer", display: true, content: "steering" },
  );

  const passive = entryToUiMessage({ type: "message", id: "p", parentId: null, timestamp: "2026-01-01T00:00:00.000Z", message: { role: "developer", passiveToolContext: true, content: "context" } });
  assert.equal(passive.customType, "passive-tool-context");
  assert.equal(passive.display, false);

  const python = entryToUiMessage({ type: "message", id: "py", parentId: null, timestamp: "2026-01-01T00:00:00.000Z", message: { role: "pythonExecution", code: "print(1)", output: "1", exitCode: 0 } });
  assert.equal(python.customType, "python-execution");
  assert.match(python.content, /Ran Python:\n```python\nprint\(1\)\n```\n```\n1\n```/);

  const mention = entryToUiMessage({ type: "message", id: "f", parentId: null, timestamp: "2026-01-01T00:00:00.000Z", message: { role: "fileMention", files: [{ path: "a.ts", content: "x" }, null, { path: 5 }] } });
  assert.equal(mention.customType, "file-mention");
  assert.match(mention.content, /^- a\.ts$/m);

  assert.equal(entryToUiMessage({ type: "model_change", id: "m", parentId: null, timestamp: "2026-01-01T00:00:00.000Z", model: "p/m" }), null);
});

test("normalizes tool-call field names and leaves other roles alone", () => {
  const message = normalizeToolCalls({
    role: "assistant",
    provider: "p",
    model: "m",
    content: [{ type: "toolCall", id: "tc1", name: "read", arguments: { path: "a.ts" } }],
  });
  assert.deepEqual(message.content[0], { type: "toolCall", toolCallId: "tc1", toolName: "read", input: { path: "a.ts" } });
  const user = { role: "user", content: "hi" };
  assert.equal(normalizeToolCalls(user), user);
});

test("infers thinking level and model along the branch, explicit changes winning", () => {
  const entries = [
    userEntry("u1", null, "start"),
    assistantEntry("a1", "u1", "answer"),
    { type: "thinking_level_change", id: "think", parentId: "a1", thinkingLevel: "high" },
    { type: "model_change", id: "model", parentId: "think", model: "provider/model/with/slashes", role: "default" },
  ];
  const context = buildSessionContext(entries);
  assert.equal(context.thinkingLevel, "high");
  assert.deepEqual(context.model, { provider: "provider", modelId: "model/with/slashes" });

  const legacy = buildSessionContext([userEntry("u1", null, "start"), assistantEntry("a1", "u1", "answer")]);
  assert.equal(legacy.thinkingLevel, "off");
  assert.deepEqual(legacy.model, { provider: "test", modelId: "test-model" });

  const providerForm = buildSessionContext([userEntry("u1", null, "s"), { type: "model_change", id: "m", parentId: "u1", provider: "openai", modelId: "gpt" }]);
  assert.deepEqual(providerForm.model, { provider: "openai", modelId: "gpt" });
});

test("the title slot serializes to exactly 256 UTF-8 bytes and round-trips", () => {
  const slot = serializeTitleSlot({ title: "Fix the login bug", source: "user", updatedAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(new TextEncoder().encode(slot).length, SESSION_TITLE_SLOT_BYTES);
  assert.equal(slot.endsWith("\n"), true);
  const parsed = parseTitleSlotLine(slot.slice(0, -1));
  assert.equal(parsed.title, "Fix the login bug");
  assert.equal(parsed.source, "user");
  assert.deepEqual(parseTitleSlotHead(`junk\n${slot}`), undefined);

  // A CJK title is cut on code points so the line still fits the slot exactly.
  const cjk = serializeTitleSlot({ title: "題".repeat(200), updatedAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(new TextEncoder().encode(cjk).length, SESSION_TITLE_SLOT_BYTES);
  const parsedCjk = parseTitleSlotLine(cjk.slice(0, -1));
  assert.ok(parsedCjk.title.length < 200);
  assert.equal(parsedCjk.title, "題".repeat(parsedCjk.title.length));
  assert.deepEqual(parseTitleSlotHead(cjk), parsedCjk);

  assert.equal(parseTitleSlotLine('{"type":"title","v":2,"title":"x","updatedAt":"t","pad":""}'), undefined);
  assert.equal(parseTitleSlotLine('{"type":"title","v":1,"title":"x","updatedAt":"t"}'), undefined);
  assert.equal(parseTitleSlotLine('{"type":"title","v":1,"title":"x","updatedAt":"t","pad":"","source":"robot"}'), undefined);
  assert.equal(parseTitleSlotLine("not json"), undefined);
  assert.equal(parseTitleSlotHead("no newline"), undefined);
});

test("JSONL parsing skips torn lines instead of failing the file", () => {
  assert.deepEqual(
    parseJsonlLenient('{"a":1}\n\n{"b":2}\n{"torn":\n{"c":3}'),
    [{ a: 1 }, { b: 2 }, { c: 3 }],
  );
  assert.deepEqual(parseJsonlLenient(""), []);
});

test("builds the entry tree with labels, orphan roots and chronological children", () => {
  const entries = [
    { type: "label", id: "l1", parentId: null, timestamp: "2026-01-01T00:00:00.000Z", targetId: "a", label: "Root" },
    { type: "message", id: "a", parentId: null, timestamp: "2026-01-01T00:00:01.000Z", message: { role: "user", content: "a" } },
    { type: "message", id: "c", parentId: "a", timestamp: "2026-01-01T00:00:03.000Z", message: { role: "user", content: "c" } },
    { type: "message", id: "b", parentId: "a", timestamp: "2026-01-01T00:00:02.000Z", message: { role: "user", content: "b" } },
    { type: "message", id: "orphan", parentId: "missing", timestamp: "2026-01-01T00:00:00.000Z", message: { role: "user", content: "o" } },
    { type: "label", id: "l2", parentId: null, timestamp: "2026-01-01T00:00:04.000Z", targetId: "b", label: "" },
  ];
  const roots = buildSessionTree(entries);
  assert.deepEqual(roots.map((node) => node.entry.id).sort(), ["a", "l1", "l2", "orphan"]);
  const root = roots.find((node) => node.entry.id === "a");
  assert.equal(root.label, "Root");
  assert.deepEqual(root.children.map((node) => node.entry.id), ["b", "c"]);
  assert.equal(getLeafEntryId(entries), "l2");
  assert.equal(getLeafEntryId([]), null);
});

test("a superseded compaction summary is a placeholder only in the pre-compaction view", () => {
  const old = { type: "compaction", id: "old", parentId: null, timestamp: "2026-01-01T00:00:00.000Z", summary: "old", firstKeptEntryId: "old", tokensBefore: 10 };
  const context = buildSessionContext([old, { ...old, id: "new", parentId: "old", summary: "new", tokensBefore: 20 }], undefined, { includePreCompaction: true });
  assert.equal(context.messages[0].content, SUPERSEDED_COMPACTION_SUMMARY);
  assert.equal(context.messages[1].content, "new");
});
