import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/api/session-types";
import { parseDiffText, toolDiff } from "./edit-diff";
import type { ToolCallBlock } from "./transcript";

function call(toolName: string, input: Record<string, unknown> = {}): ToolCallBlock {
  return { type: "toolCall", toolCallId: "tc1", toolName, input };
}

function result(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return { role: "toolResult", toolCallId: "tc1", toolName: "edit", content: [], ...overrides };
}

/** The exact shape omp writes into `details.diff`, hunk gaps included. */
const OMP_DIFF = [
  " 6|import { firstValueFrom } from 'rxjs';",
  "-8|import { GraphService } from '@swagger/api';",
  "+8|import { ObjectService } from '@swagger/api';",
  " 9|import { Paging } from '@swagger/api';",
  "",
  "-37|    ObjectInvoicesQry,",
  "-38|    ObjectInvoicesQryVariables,",
  "+37|    ObjInDocVerQryVariables,",
  " 42|} from '../graphql/types/ObjInDocVerQry';",
].join("\n");

describe("parseDiffText", () => {
  it("reads omp's numbered diff into context, remove, add and gap rows", () => {
    const lines = parseDiffText(OMP_DIFF);
    expect(lines).not.toBeNull();
    if (!lines) return;

    expect(lines.map((line) => line.kind)).toEqual([
      "context",
      "remove",
      "add",
      "context",
      "gap",
      "remove",
      "remove",
      "add",
      "context",
    ]);
    expect(lines[0]).toMatchObject({ kind: "context", lineNumber: 6 });
    expect(lines[1]).toMatchObject({ kind: "remove", lineNumber: 8 });
    expect(lines[4]).toMatchObject({ kind: "gap", lineNumber: null, text: "" });
  });

  it("emphasizes only the fragment that changed in a replaced line", () => {
    const lines = parseDiffText(OMP_DIFF) ?? [];
    const removed = lines[1]!;
    const added = lines[2]!;
    // `GraphService` and `ObjectService` share the `Service` suffix, so the
    // minimal change is the leading word only.
    expect(removed.text.slice(removed.emphasis![0], removed.emphasis![1])).toBe("Graph");
    expect(added.text.slice(added.emphasis![0], added.emphasis![1])).toBe("Object");
  });

  it("leaves the long side of a pure insertion as the only emphasized span", () => {
    const lines =
      parseDiffText("-1|switch (kind) {\n+1|switch (kind ?? 'none') {") ?? [];
    const added = lines[1]!;
    expect(added.text.slice(added.emphasis![0], added.emphasis![1])).toBe(" ?? 'none'");
    const removed = lines[0]!;
    expect(removed.emphasis === null || removed.text.slice(...removed.emphasis).trim() === "").toBe(
      true,
    );
  });

  it("does not split a surrogate pair when the change is an emoji", () => {
    const lines = parseDiffText("-1|title: \u{1F600} done\n+1|title: \u{1F601} done") ?? [];
    const added = lines[1]!;
    expect(added.text.slice(added.emphasis![0], added.emphasis![1])).toBe("\u{1F601}");
  });

  it("treats a trailing newline as the end of the text, not as a hunk gap", () => {
    const lines = parseDiffText(" 1|a\n+2|b\n") ?? [];
    expect(lines.map((line) => line.kind)).toEqual(["context", "add"]);
  });

  it("returns null for anything that is not a diff", () => {
    expect(parseDiffText("")).toBeNull();
    expect(parseDiffText("Done in 3 edits.")).toBeNull();
    expect(parseDiffText("1|missing the marker")).toBeNull();
  });
});

describe("toolDiff", () => {
  it("uses the diff and path omp reported", () => {
    const diff = toolDiff(
      call("edit", { i: "Rewire the import" }),
      result({ details: { diff: OMP_DIFF, path: "src/app/objects.service.ts", oldText: "x" } }),
    );
    expect(diff).toMatchObject({ path: "src/app/objects.service.ts", adds: 2, removes: 3 });
    expect(diff?.lines).toHaveLength(9);
  });

  it("falls back to the [path#HASH] header when details carry no path", () => {
    const diff = toolDiff(
      call("edit"),
      result({
        details: { diff: OMP_DIFF },
        content: [{ type: "text", text: "[D:\\repo\\a.ts#B9DB]\n 1|x" }],
      }),
    );
    expect(diff?.path).toBe("D:\\repo\\a.ts");
  });

  it("falls back to the path the call named", () => {
    const diff = toolDiff(call("edit", { path: "src/b.ts" }), result({ details: { diff: " 1|x" } }));
    expect(diff?.path).toBe("src/b.ts");
  });

  it("renders a write as one added block", () => {
    const diff = toolDiff(
      call("write", { path: "D:/repo/plan.md", content: "# Plan\n\n- step" }),
      result({ toolName: "write", content: [{ type: "text", text: "Wrote plan.md" }] }),
    );
    expect(diff).toMatchObject({ path: "D:/repo/plan.md", adds: 3, removes: 0 });
    expect(diff?.lines.map((line) => line.lineNumber)).toEqual([1, 2, 3]);
    expect(diff?.lines.every((line) => line.kind === "add")).toBe(true);
  });

  it("keeps the plain view for calls without a diff", () => {
    expect(toolDiff(call("edit"), null)).toBeNull();
    expect(toolDiff(call("edit"), result({ partial: true, details: { diff: OMP_DIFF } }))).toBeNull();
    expect(toolDiff(call("edit"), result({ isError: true, details: { diff: OMP_DIFF } }))).toBeNull();
    expect(toolDiff(call("edit"), result({ details: { diff: "not a diff" } }))).toBeNull();
    expect(
      toolDiff(
        call("bash"),
        result({ toolName: "bash", content: [{ type: "text", text: "ok" }] }),
      ),
    ).toBeNull();
  });
});
