import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary, ProjectSummary } from "@/api/workspace";
import { RailSkin } from "./RailSkin";

afterEach(cleanup);

const projects = [
  { path: "/projects/games", alias: "Games" },
] as unknown as ProjectSummary[];

const session = {
  path: "/sessions/one.jsonl",
  id: "session-one",
  cwd: "/projects/games",
  projectRoot: "/projects/games",
  name: "First session",
  created: "2026-01-01T00:00:00.000Z",
  modified: "2026-01-01T00:00:00.000Z",
  messageCount: 1,
  firstMessage: "hi",
} as SessionSummary;

function renderRail(overrides: Partial<Parameters<typeof RailSkin>[0]> = {}) {
  const props: Parameters<typeof RailSkin>[0] = {
    sessions: [],
    projects,
    selected: null,
    draftId: null,
    running: new Set(),
    unseen: new Set(),
    loading: false,
    error: null,
    onSelect: () => {},
    onNewSession: () => {},
    onRefresh: () => {},
    onCollapse: () => {},
    onOpenSettings: () => {},
    onAddWorkspace: () => {},
    onArchiveSession: () => {},
    onArchiveProject: () => {},
    ...overrides,
  };
  render(<RailSkin {...props} />);
}

describe("rail new session entry point", () => {
  it("creates from a project header with that root", () => {
    const onNewSession = vi.fn();
    renderRail({ onNewSession });

    fireEvent.click(screen.getByRole("button", { name: "New session in Games" }));

    expect(onNewSession).toHaveBeenCalledWith("/projects/games");
  });

  it("offers a workspace folder button beside search", () => {
    const onToggleWorkspacePicker = vi.fn();
    renderRail({ onAddWorkspace: onToggleWorkspacePicker });

    fireEvent.click(screen.getByRole("button", { name: "Add workspace folder" }));

    expect(onToggleWorkspacePicker).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Search sessions" })).toBeTruthy();
  });
});

describe("draft session", () => {
  const draft = {
    ...session,
    path: "",
    id: "__new_session__",
    name: "New session",
    messageCount: 0,
    firstMessage: "",
  } as SessionSummary;

  it("shows the unsaved chat in its project and marks it active", () => {
    renderRail({ sessions: [draft], selected: draft.id, draftId: draft.id });

    expect(screen.getByText("New session")).toBeTruthy();
    expect(document.querySelector('[aria-current="page"]')?.textContent).toContain("New session");
  });

  it("offers no archive action for the unsaved chat", () => {
    renderRail({ sessions: [draft], selected: draft.id, draftId: draft.id });

    expect(screen.queryByRole("button", { name: "Archive New session" })).toBeNull();
  });

  it("is gone once a real session is selected", () => {
    renderRail({ sessions: [draft], selected: null, draftId: null });

    expect(document.querySelector('[aria-current="page"]')).toBeNull();
  });
});

describe("session status indicators", () => {
  const statusIn = (container: HTMLElement): string | null =>
    container.querySelector("[data-status]")?.getAttribute("data-status") ?? null;

  it("keeps running sessions in their project group instead of an Active section", () => {
    renderRail({ sessions: [session], running: new Set(["session-one"]) });

    expect(screen.queryByText("Active")).toBeNull();
    expect(screen.getByText("Games")).toBeTruthy();
    expect(screen.getByText("First session")).toBeTruthy();
    expect(statusIn(document.body)).toBe("running");
  });

  it("shows a blue dot for a finished chat that has not been opened", () => {
    renderRail({ sessions: [session], unseen: new Set(["session-one"]) });

    expect(statusIn(document.body)).toBe("unread");
  });

  it("shows no status once the chat is open or read", () => {
    renderRail({ sessions: [session], unseen: new Set() });

    expect(statusIn(document.body)).toBeNull();
  });

  it("lets the spinner win over an unread dot", () => {
    renderRail({
      sessions: [session],
      running: new Set(["session-one"]),
      unseen: new Set(["session-one"]),
    });

    expect(statusIn(document.body)).toBe("running");
  });
});

describe("rail archive actions", () => {
  it("archives a single session from its row", () => {
    const onArchiveSession = vi.fn();
    renderRail({ sessions: [session], onArchiveSession });

    fireEvent.click(screen.getByRole("button", { name: "Archive First session" }));

    expect(onArchiveSession).toHaveBeenCalledWith("session-one");
  });

  it("archives the whole project from its header", () => {
    const onArchiveProject = vi.fn();
    renderRail({ sessions: [session], onArchiveProject });

    fireEvent.click(screen.getByRole("button", { name: "Archive project Games" }));

    expect(onArchiveProject).toHaveBeenCalledWith("/projects/games");
  });

  it("has no archived-sessions toggle in the header", () => {
    renderRail({ sessions: [session] });

    expect(screen.queryByRole("button", { name: /archived sessions/i })).toBeNull();
    expect(screen.queryByText("Archived")).toBeNull();
  });
});
