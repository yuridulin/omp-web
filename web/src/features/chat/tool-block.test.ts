import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/api/session-types";
import { durationLabel, toolBlock } from "./tool-block";
import type { ToolCallBlock } from "./transcript";

function call(toolName: string, input: Record<string, unknown> = {}): ToolCallBlock {
  return { type: "toolCall", toolCallId: "tc1", toolName, input };
}

function result(overrides: Partial<ChatMessage> = {}): ChatMessage {
  const { details, ...rest } = overrides;
  return {
    role: "toolResult",
    toolCallId: "tc1",
    content: [],
    ...rest,
    ...(details === undefined ? {} : { details }),
  };
}

const DIFF = "-1|const a = 1;\n+1|const a = 2;";

describe("durationLabel", () => {
  it("stays short and locale-free", () => {
    expect(durationLabel(145)).toBe("145ms");
    expect(durationLabel(12_400)).toBe("12.4s");
    expect(durationLabel(200_000)).toBe("3m 20s");
    expect(durationLabel(Number.NaN)).toBe("");
  });
});

describe("toolBlock", () => {
  it("renders an edit from omp's diff and path", () => {
    const block = toolBlock(
      call("edit", { i: "Bump the constant" }),
      result({ toolName: "edit", details: { diff: DIFF, path: "src/a.ts" } }),
    );
    expect(block).toMatchObject({
      badge: "edit",
      title: "src/a.ts",
      status: { text: "+1 −1", tone: "muted" },
      open: true,
    });
    expect(block?.sections).toEqual([
      { kind: "diff", diff: expect.objectContaining({ path: "src/a.ts", adds: 1, removes: 1 }) },
    ]);
  });

  it("renders a write as an added block even without a diff", () => {
    const block = toolBlock(
      call("write", { path: "D:/repo/plan.md", content: "a\nb" }),
      result({ toolName: "write", content: [{ type: "text", text: "Wrote plan.md" }] }),
    );
    expect(block).toMatchObject({ badge: "write", title: "D:/repo/plan.md" });
    expect(block?.sections[0]).toMatchObject({ kind: "diff" });
  });

  it("renders every eval cell with its language, duration and status", () => {
    const block = toolBlock(
      call("eval", { i: "Screenshot the dialog" }),
      result({
        toolName: "eval",
        details: {
          language: "js",
          cells: [
            { index: 0, title: "Shot", code: "await tab.shot();", language: "js", output: "ok", status: "ok", exitCode: 0, durationMs: 100 },
            { index: 1, title: "Read", code: "console.log(1);", language: "js", output: "", status: "ok", exitCode: 0, durationMs: 45 },
          ],
        },
      }),
    );
    expect(block).toMatchObject({
      badge: "JS",
      title: "Screenshot the dialog",
      meta: "145ms",
      status: { text: "ok", tone: "ok" },
    });
    expect(block?.sections).toHaveLength(2);
    expect(block?.sections[0]).toMatchObject({ kind: "code", language: "javascript", output: "ok" });
  });

  it("marks a failed eval cell as an error", () => {
    const block = toolBlock(
      call("eval"),
      result({
        toolName: "eval",
        details: { cells: [{ code: "boom()", language: "py", status: "failed", exitCode: 1 }] },
      }),
    );
    expect(block?.badge).toBe("PY");
    expect(block?.status).toMatchObject({ tone: "error" });
  });

  it("renders a todo result as phases with counted tasks", () => {
    const block = toolBlock(
      call("todo", { op: "init", i: "Проверка фикса" }),
      result({
        toolName: "todo",
        details: {
          op: "init",
          phases: [
            { name: "I. Апгрейд", tasks: [{ content: "Поднять пакеты", status: "completed" }, { content: "Сборка", status: "in_progress" }] },
            { name: "II. Проверка", tasks: [{ content: "Smoke", status: "pending" }] },
          ],
        },
      }),
    );
    expect(block).toMatchObject({ badge: "todo", title: "Проверка фикса", meta: "3 tasks", status: { text: "1/3", tone: "muted" } });
    expect(block?.sections[0]).toMatchObject({
      kind: "todo",
      phases: [
        { name: "I. Апгрейд", tasks: [{ text: "Поднять пакеты", status: "completed" }, { text: "Сборка", status: "in_progress" }] },
        { name: "II. Проверка", tasks: [{ text: "Smoke", status: "pending" }] },
      ],
    });
  });

  it("renders a bash call as a shell command plus its output and exit code", () => {
    const block = toolBlock(
      call("bash", { command: "bun run test", i: "Run the suite" }),
      result({
        toolName: "bash",
        details: { exitCode: 1, wallTimeMs: 12_400 },
        content: [{ type: "text", text: "1 failed" }],
      }),
    );
    expect(block).toMatchObject({
      badge: "bash",
      title: "Run the suite",
      meta: "12.4s",
      status: { text: "exit 1", tone: "error" },
    });
    expect(block?.sections[0]).toMatchObject({ kind: "code", language: "shell", code: "bun run test", output: "1 failed" });
  });

  it("keeps noisy tools collapsed but still describes them", () => {
    const block = toolBlock(
      call("read", { path: "src/a.ts" }),
      result({ toolName: "read", details: { totalLines: 263 }, content: [{ type: "text", text: "1: x" }] }),
    );
    expect(block).toMatchObject({ open: false, title: "src/a.ts", meta: "263 lines" });
    expect(block?.sections).toEqual([{ kind: "output", text: "1: x" }]);
  });

  it("falls back to an output block for unknown tools and odd details", () => {
    const block = toolBlock(
      call("hub", { to: "Scout" }),
      result({ toolName: "hub", details: { phases: "not an array" }, content: [{ type: "text", text: "sent" }] }),
    );
    expect(block).toMatchObject({ badge: "hub", open: true });
    expect(block?.sections).toEqual([{ kind: "output", text: "sent" }]);
  });

  it("shows a running status while the call has no result", () => {
    const block = toolBlock(call("bash", { command: "sleep 1" }), null);
    expect(block?.status).toMatchObject({ text: "running…", tone: "running" });
    expect(block?.sections[0]).toMatchObject({ kind: "code", code: "sleep 1", output: "" });
    expect(toolBlock(call("read", { path: "a" }), null)).toBeNull();
  });
});

describe("toolBlock with a stripped history payload", () => {
  it("builds an eval block from the call when details.cells are gone", () => {
    const block = toolBlock(
      call("eval", { language: "py", code: "print('hi')", i: "Probe the API" }),
      result({ toolName: "eval", content: [{ type: "text", text: "hi" }] }),
    );
    expect(block).toMatchObject({ badge: "PY", title: "Probe the API" });
    expect(block?.sections).toEqual([
      { kind: "code", language: "python", code: "print('hi')", output: "hi" },
    ]);
  });
});
