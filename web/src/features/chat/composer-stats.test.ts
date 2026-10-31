import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/api/session-types";
import { composerUsageStats, formatTokens } from "./composer-stats";

function message(role: string, content: unknown, extra: Record<string, unknown> = {}): ChatMessage {
  return { role, content, ...extra };
}

describe("composerUsageStats", () => {
  it("counts turns, tool steps, tokens and cache hits", () => {
    const stats = composerUsageStats([
      message("user", [{ type: "text", text: "hello" }]),
      message(
        "assistant",
        [
          { type: "text", text: "working" },
          { type: "toolCall", toolCallId: "call-1", toolName: "read", input: {} },
        ],
        {
          usage: {
            input: 1_000,
            output: 500,
            cacheRead: 3_000,
            cacheWrite: 500,
            totalTokens: 5_000,
          },
        },
      ),
      message("toolResult", [{ type: "text", text: "done" }]),
      message("assistant", [{ type: "text", text: "finished" }], {
        usage: { input: 200, output: 100, cacheRead: 800 },
      }),
    ]);

    expect(stats).toEqual({
      turns: 1,
      steps: 1,
      tokens: 6_100,
      cacheHit: 76,
    });
  });

  it("ignores malformed usage records", () => {
    const stats = composerUsageStats([
      message("assistant", [{ type: "text", text: "bad" }], {
        usage: { input: "nope", output: null, cacheRead: Number.NaN, totalTokens: -1 },
      }),
    ]);

    expect(stats).toEqual({ turns: 0, steps: 0, tokens: 0, cacheHit: null });
  });
});

describe("formatTokens", () => {
  it("compacts counts for the status strip", () => {
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(12_400)).toBe("12.4K");
    expect(formatTokens(173_000)).toBe("173K");
    expect(formatTokens(3_200_000)).toBe("3.2M");
  });
});
