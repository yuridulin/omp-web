import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectSummary, SessionSummary } from "@/api/workspace";
import { RailColumn } from "./RailColumn";

const state = vi.hoisted(() => ({
  sessions: [] as SessionSummary[],
  onPendingListed: vi.fn(),
  onSelect: vi.fn(),
}));

vi.mock("@/features/sessions/use-sessions", () => ({
  useSessions: () => ({
    data: { sessions: state.sessions, runningSessionIds: [] },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/features/projects/use-projects", () => ({
  useProjects: () => ({
    data: [{ path: "/work/alpha", alias: "Alpha" }] as ProjectSummary[],
    refetch: vi.fn(),
  }),
}));

vi.mock("@/features/system/use-system-config", () => ({
  useWebSettings: () => ({ data: { hideInactiveSessionsAfterDays: 30 } }),
}));

vi.mock("@/state/event-stream", () => ({
  useRunningSessions: () => new Set<string>(),
}));

afterEach(cleanup);

beforeEach(() => {
  state.sessions = [];
  state.onPendingListed.mockReset();
  state.onSelect.mockReset();
});

const pending = {
  path: "",
  id: "live-one",
  cwd: "/work/alpha",
  projectRoot: "/work/alpha",
  name: "New session",
  created: new Date().toISOString(),
  modified: new Date().toISOString(),
  messageCount: 0,
  firstMessage: "",
} as SessionSummary;

const listed = {
  ...pending,
  path: "/sessions/live-one.jsonl",
  name: "First session",
  firstMessage: "hello",
  messageCount: 1,
} as SessionSummary;

const baseProps = {
  selected: pending.id,
  draftCwd: null,
  onPendingListed: state.onPendingListed,
  onSelect: state.onSelect,
  onNewSession: () => {},
  onOpenSettings: () => {},
};

describe("pending session", () => {
  it("shows a just-created session before omp writes its file", () => {
    render(<RailColumn {...baseProps} pendingSession={pending} />);

    expect(screen.getByText("New session")).toBeTruthy();
    expect(document.querySelector('[aria-current="page"]')?.textContent).toContain("New session");
    expect(screen.queryByRole("button", { name: "Archive New session" })).toBeNull();
  });

  it("does not drop the row while the server list still trails it", () => {
    render(<RailColumn {...baseProps} pendingSession={pending} />);

    fireEvent.click(screen.getByText("New session"));

    expect(state.onSelect).not.toHaveBeenCalled();
    expect(screen.getByText("New session")).toBeTruthy();
  });

  it("hands the row over to the polled list and clears the pending copy", () => {
    const view = render(<RailColumn {...baseProps} pendingSession={pending} />);
    state.sessions = [listed];
    view.rerender(<RailColumn {...baseProps} pendingSession={pending} />);

    expect(screen.queryByText("New session")).toBeNull();
    expect(screen.getByText("First session")).toBeTruthy();
    expect(state.onPendingListed).toHaveBeenCalled();
  });
});
