import { describe, expect, it } from "vitest";
import {
  buildInlinePrompt,
  INLINE_MAX_INSTRUCTION,
  INLINE_MAX_SELECTION_BYTES,
  inlineSelectionError,
  type InlineSelection,
} from "./inline-edit";

function selection(text: string): InlineSelection {
  return { startLine: 2, startColumn: 1, endLine: 4, endColumn: 7, text };
}

describe("inline edit prompts", () => {
  it("rejects empty and oversized instructions", () => {
    expect(inlineSelectionError(selection("x"), "   ")).toBe("Describe the change first.");
    expect(inlineSelectionError(selection("x"), "a".repeat(INLINE_MAX_INSTRUCTION + 1))).toContain("longer than");
    expect(inlineSelectionError(selection("x"), "ok")).toBeNull();
  });

  it("rejects selections above the byte cap", () => {
    expect(inlineSelectionError(selection("a".repeat(INLINE_MAX_SELECTION_BYTES + 1)), "ok")).toBe(
      "Selection is too large; select fewer lines.",
    );
  });

  it("includes the path, line range, instruction and selected code", () => {
    const prompt = buildInlinePrompt({
      path: "/repo/src/a.ts",
      language: "typescript",
      selection: selection("const x = 1;\nconst y = 2;"),
      instruction: "  Rename x to count  ",
    });
    expect(prompt).toContain("Inline edit for /repo/src/a.ts (lines 2-4).");
    expect(prompt).toContain("Instruction: Rename x to count");
    expect(prompt).toContain("```typescript");
    expect(prompt).toContain("const x = 1;\nconst y = 2;");
    expect(prompt).toContain("Apply the change to /repo/src/a.ts now");
  });

  it("uses a fence longer than any backtick run in the selection", () => {
    const prompt = buildInlinePrompt({
      path: "/repo/a.md",
      language: "markdown",
      selection: selection("```js\nconst x = 1;\n```"),
      instruction: "Fix it",
    });
    expect(prompt).toContain("````markdown");
    expect(prompt).toContain("\n````\n\nApply the change");
  });
});
