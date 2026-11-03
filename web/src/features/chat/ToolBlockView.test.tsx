import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToolBlockView } from "./ToolBlockView";
import { testTranscriptClasses } from "./test-classes";
import type { ToolBlock } from "./tool-block";
import type { DiffLine } from "./edit-diff";

// Monaco is a browser-only chunk; the block falls back to plain text here.
vi.mock("@/editor/monaco", () => ({
  monacoTheme: () => "omp-light",
  setupMonaco: () => ({
    editor: {
      setTheme: () => {},
      colorize: async (text: string) => `<span class="mtk1">${text}</span>`,
    },
  }),
}));

function block(overrides: Partial<ToolBlock> = {}): ToolBlock {
  return {
    badge: "bash",
    title: "Run the suite",
    meta: "12.4s",
    status: { text: "exit 0", tone: "ok" },
    open: true,
    sections: [{ kind: "output", text: "270 passed" }],
    ...overrides,
  };
}

function diffLine(kind: DiffLine["kind"], lineNumber: number | null, text: string): DiffLine {
  return { kind, lineNumber, text, emphasis: null };
}

describe("ToolBlockView", () => {
  it("puts the badge, what it was for, the duration and the outcome in the header", () => {
    const { container } = render(<ToolBlockView block={block()} classes={testTranscriptClasses} />);
    expect(screen.getByText("bash")).toBeTruthy();
    expect(screen.getByText("Run the suite")).toBeTruthy();
    expect(screen.getByText("12.4s")).toBeTruthy();
    expect(screen.getByText("exit 0")).toBeTruthy();
    expect(container.querySelector("details")?.hasAttribute("open")).toBe(true);
  });

  it("starts a noisy tool folded", () => {
    const { container } = render(
      <ToolBlockView block={block({ open: false })} classes={testTranscriptClasses} />,
    );
    expect(container.querySelector("details")?.hasAttribute("open")).toBe(false);
  });

  it("renders diff rows and emphasizes the changed fragment", () => {
    render(
      <ToolBlockView
        classes={testTranscriptClasses}
        block={block({
          badge: "edit",
          title: "src/a.ts",
          status: { text: "+1 −1", tone: "muted" },
          sections: [
            {
              kind: "diff",
              diff: {
                path: "src/a.ts",
                adds: 1,
                removes: 1,
                lines: [
                  diffLine("context", 41, "before"),
                  { ...diffLine("remove", 42, "const a = 1;"), emphasis: [10, 11] },
                  { ...diffLine("add", 42, "const a = 2;"), emphasis: [10, 11] },
                ],
              },
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("src/a.ts")).toBeTruthy();
    expect(screen.getByText("before")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getAllByText("42")).toHaveLength(2);
  });

  it("folds a long diff behind one control", () => {
    const lines = Array.from({ length: 25 }, (_value, index) => diffLine("context", index + 1, `line ${index + 1}`));
    render(
      <ToolBlockView
        classes={testTranscriptClasses}
        block={block({
          sections: [{ kind: "diff", diff: { path: "a.ts", adds: 0, removes: 0, lines } }],
        })}
      />,
    );
    expect(screen.queryByText("line 25")).toBeNull();
    expect(screen.getByText("Show all 25 lines (5 hidden)")).toBeTruthy();
  });

  it("renders todo phases with counted, checked-off tasks", () => {
    render(
      <ToolBlockView
        classes={testTranscriptClasses}
        block={block({
          badge: "todo",
          title: "Проверка фикса",
          meta: "3 tasks",
          status: { text: "1/3", tone: "muted" },
          sections: [
            {
              kind: "todo",
              phases: [
                {
                  name: "I. Апгрейд",
                  tasks: [
                    { text: "Поднять пакеты", status: "completed" },
                    { text: "Сборка", status: "in_progress" },
                  ],
                },
                { name: "II. Проверка", tasks: [{ text: "Smoke", status: "pending" }] },
              ],
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("I. Апгрейд")).toBeTruthy();
    expect(screen.getByText("1/2")).toBeTruthy();
    expect(screen.getByText("0/1")).toBeTruthy();
    expect(screen.getByText("Сборка").closest("[data-status]")?.getAttribute("data-status")).toBe(
      "in_progress",
    );
  });

  it("renders a command as code and folds a long output", () => {
    const output = Array.from({ length: 30 }, (_value, index) => `row ${index + 1}`).join("\n");
    const { container } = render(
      <ToolBlockView
        classes={testTranscriptClasses}
        block={block({
          sections: [
            { kind: "code", language: "shell", code: "bun run test", output },
          ],
        })}
      />,
    );
    expect(screen.getByText("bun run test")).toBeTruthy();
    expect(container.textContent).toContain("row 20");
    expect(container.textContent).not.toContain("row 21");
    expect(screen.getByText("Show all 30 lines (10 hidden)")).toBeTruthy();
  });

  it("flags a failed call for styling", () => {
    const { container } = render(
      <ToolBlockView
        classes={testTranscriptClasses}
        block={block({ status: { text: "error", tone: "error" } })}
      />,
    );
    expect(container.querySelector("details")?.getAttribute("data-error")).toBe("true");
    expect(container.querySelector("details")?.getAttribute("data-pending")).toBe("false");
  });
});
