import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/api/session-types";
import {
  EAGER_TAIL,
  eagerTailStart,
  isHiddenMessage,
  isPairedToolResult,
  pairToolResults,
  toolCallIds,
  transcriptRows,
  withOptimistic,
} from "./transcript-rows";

const result = (callId: string, text = "out"): ChatMessage => ({
  role: "toolResult",
  toolCallId: callId,
  content: [{ type: "text", text }],
});

const call = (callId: string): ChatMessage => ({
  role: "assistant",
  content: [{ type: "toolCall", toolCallId: callId, toolName: "read", input: {} }],
});

describe("pairToolResults", () => {
  it("indexes history results by call id and skips other roles", () => {
    const paired = pairToolResults(
      [result("a"), { role: "assistant", toolCallId: "b", content: "" }, result("c")],
      undefined,
    );
    expect([...paired.keys()]).toEqual(["a", "c"]);
    expect(paired.get("a")?.toolCallId).toBe("a");
  });

  it("lets live results fill gaps and win over the history copy", () => {
    const paired = pairToolResults([result("a", "old")], {
      a: result("a", "new"),
      b: result("b"),
      junk: { role: "assistant" },
      keyed: { role: "toolResult", content: [] },
    });
    expect(paired.get("a")?.content).toEqual([{ type: "text", text: "new" }]);
    expect(paired.get("b")?.toolCallId).toBe("b");
    expect(paired.has("junk")).toBe(false);
    expect(paired.get("keyed")?.toolCallId).toBeUndefined();
  });
});

describe("tool call pairing", () => {
  it("collects non-empty call ids from assistant blocks only", () => {
    const ids = toolCallIds([
      call("a"),
      call(""),
      { role: "user", content: [{ type: "toolCall", toolCallId: "ignored", toolName: "x", input: {} }] },
      { role: "assistant", content: "plain" },
    ]);
    expect([...ids]).toEqual(["a"]);
  });

  it("only hides a tool result whose call id reached the transcript", () => {
    const ids = new Set(["a"]);
    expect(isPairedToolResult(result("a"), ids)).toBe(true);
    expect(isPairedToolResult(result("b"), ids)).toBe(false);
    expect(isPairedToolResult({ role: "tool", toolCallId: "a", content: "" }, ids)).toBe(false);
    expect(isPairedToolResult({ role: "toolResult", content: "" }, ids)).toBe(false);
  });
});

describe("transcriptRows", () => {
  it("drops paired results and keeps unpaired ones in order", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "hi" },
      call("a"),
      result("a"),
      result("orphan"),
    ];
    const rows = transcriptRows(messages, new Set(["a"]));
    expect(rows.map((row) => row.index)).toEqual([0, 1, 3]);
    expect(rows.at(-1)?.message.toolCallId).toBe("orphan");
  });

  it("hides server messages marked display:false", () => {
    expect(isHiddenMessage({ role: "custom", content: "hidden note", display: false })).toBe(true);
    expect(isHiddenMessage({ role: "custom", content: "shown note", display: true })).toBe(false);
  });

  it("hides a row that carried only a system reminder", () => {
    const reminder = {
      role: "custom",
      customType: "eval-state-context",
      content: "<system-reminder>\nruntime state\n</system-reminder>",
    };
    expect(isHiddenMessage(reminder)).toBe(true);

    const messages: ChatMessage[] = [reminder, { role: "user", content: "hi" }];
    expect(transcriptRows(messages, new Set()).map((row) => row.index)).toEqual([1]);
  });

  it("keeps a prompt that carried a reminder next to real content", () => {
    expect(
      isHiddenMessage({
        role: "user",
        content: [{ type: "text", text: "question <system-reminder>date</system-reminder>" }],
      }),
    ).toBe(false);
    expect(
      isHiddenMessage({
        role: "user",
        content: [{ type: "text", text: "<system-reminder>date</system-reminder>" }, { type: "image", url: "/a.png" }],
      }),
    ).toBe(false);
  });

  it("keeps assistant rows even when they have no body to paint", () => {
    expect(isHiddenMessage({ role: "assistant", content: [] })).toBe(false);
  });
});

describe("optimistic prompt and eager tail", () => {
  it("appends the optimistic prompt without mutating history", () => {
    const history: ChatMessage[] = [{ role: "user", content: "one" }];
    const prompt: ChatMessage = { role: "user", content: "two" };
    const merged = withOptimistic(history, prompt);
    expect(merged).toHaveLength(2);
    expect(merged[1]).toBe(prompt);
    expect(history).toHaveLength(1);
    expect(withOptimistic(history, null)).toHaveLength(1);
  });

  it("does not paint the optimistic prompt once history already has it", () => {
    const history: ChatMessage[] = [
      { role: "user", content: [{ type: "text", text: "Забери коммиты, посмотри изменения" }] },
    ];
    const prompt: ChatMessage = { role: "user", content: "Забери коммиты, посмотри изменения" };
    expect(withOptimistic(history, prompt)).toEqual(history);
  });

  it("eagerly renders at most the tail", () => {
    expect(eagerTailStart(3)).toBe(0);
    expect(eagerTailStart(EAGER_TAIL)).toBe(0);
    expect(eagerTailStart(30)).toBe(30 - EAGER_TAIL);
  });
});
