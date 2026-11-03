import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SubagentRow, SubagentsFrame } from "@/api/subagents";
import { getLayout, getWorkbenchContext, resetLayoutForTests, subagentTabId } from "@/layout/layout-store";
import { applySubagentsFrame, resetSubagentRosters } from "@/state/subagents-store";
import { AgentsList } from "./AgentsList";

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

function renderList(sessionId = "s1") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AgentsList sessionId={sessionId} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  resetSubagentRosters();
  resetLayoutForTests();
  localStorage.clear();
});

afterEach(cleanup);

describe("AgentsList", () => {
  it("groups running and finished agents and shows the current tool while running", () => {
    applySubagentsFrame("s1", frame([
      row({ progress: { currentTool: "read board.ts", tokens: 1200 } }),
      row({ id: "EngineCore", status: "completed", durationMs: 74_000, task: "Write state.ts" }),
    ]));

    renderList();

    expect(screen.getByText("Running · 1")).toBeTruthy();
    expect(screen.getByText("Finished · 1")).toBeTruthy();
    expect(screen.getByText("read board.ts")).toBeTruthy();
    expect(screen.getByText("1m 14s")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("opens a subagent tab and reveals the workbench on click", () => {
    applySubagentsFrame("s1", frame([row()]));
    renderList();

    fireEvent.click(screen.getByRole("listitem", { name: /scout Scout/ }));

    const context = getWorkbenchContext("s1");
    expect(context.tabs.map((tab) => tab.id)).toEqual([subagentTabId("Scout")]);
    expect(context.activeTabId).toBe(subagentTabId("Scout"));
    expect(getLayout().workbenchCollapsed).toBe(false);
  });

  it("explains an empty roster instead of rendering nothing", () => {
    applySubagentsFrame("s1", frame([]));
    renderList();

    expect(screen.getByText("No subagents in this session yet.")).toBeTruthy();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
