import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SubagentRow, SubagentsFrame } from "@/api/subagents";
import { getLayout, getWorkbenchContext, resetLayoutForTests, subagentTabId } from "@/layout/layout-store";
import { applySubagentsFrame, resetSubagentRosters } from "@/state/subagents-store";
import { testRunningAgentsClasses } from "./test-classes";
import { RunningAgentsStrip } from "./RunningAgentsStrip";

vi.mock("@/api/lsp", () => ({
  closeLspDocument: vi.fn(async () => ({ closed: true })),
}));

function row(overrides: Partial<SubagentRow> = {}): SubagentRow {
  return {
    id: "Scout",
    agent: "scout",
    status: "started",
    index: 0,
    transcriptAvailable: true,
    task: "Map the workbench surface",
    ...overrides,
  } as SubagentRow;
}

function frame(roster: SubagentRow[]): SubagentsFrame {
  return { type: "subagents", revision: 1, live: true, roster, activity: {}, transcriptVersions: {} };
}

function renderStrip(limit?: number) {
  render(
    <RunningAgentsStrip
      sessionId="s1"
      classes={testRunningAgentsClasses}
      {...(limit === undefined ? {} : { limit })}
    />,
  );
}

beforeEach(() => {
  resetSubagentRosters();
  resetLayoutForTests();
  localStorage.clear();
});

afterEach(cleanup);

describe("RunningAgentsStrip", () => {
  it("renders nothing while no agent is running", () => {
    applySubagentsFrame("s1", frame([row({ status: "completed" })]));
    renderStrip();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the running agent with its current tool and elapsed time", () => {
    applySubagentsFrame("s1", frame([
      row({ progress: { currentTool: "read", currentToolArgs: "board.ts", durationMs: 0 } }),
      row({ id: "Writer", status: "completed" }),
    ]));
    renderStrip();

    const strip = screen.getByRole("status");
    expect(strip.textContent).toContain("Scout");
    expect(strip.textContent).toContain("read · board.ts");
    expect(strip.textContent).toContain("Working");
    expect(strip.textContent).toContain("<1 min");
    expect(strip.textContent).not.toContain("Writer");
  });

  it("falls back to the task's first line when no tool is reported", () => {
    applySubagentsFrame("s1", frame([
      row({ task: "Repo: …/omp-web — read-only recon\nsecond line" }),
    ]));
    renderStrip();

    expect(screen.getByRole("status").textContent).toContain("Repo: …/omp-web — read-only recon");
    expect(screen.getByRole("status").textContent).not.toContain("second line");
  });

  it("opens the agent's tab on click", () => {
    applySubagentsFrame("s1", frame([row()]));
    renderStrip();

    fireEvent.click(screen.getByRole("button", { name: /Scout/ }));

    const context = getWorkbenchContext("s1");
    expect(context.tabs.map((tab) => tab.id)).toEqual([subagentTabId("Scout")]);
    expect(getLayout().workbenchCollapsed).toBe(false);
  });

  it("collapses extra running agents into a link to the agents view", () => {
    applySubagentsFrame("s1", frame([
      row(),
      row({ id: "Review" }),
      row({ id: "Writer" }),
    ]));
    renderStrip(1);

    expect(screen.getByRole("status").textContent).not.toContain("Review");
    fireEvent.click(screen.getByRole("button", { name: "+2 more" }));

    expect(getWorkbenchContext("s1").view).toBe("agents");
    expect(getLayout().workbenchCollapsed).toBe(false);
  });
});
