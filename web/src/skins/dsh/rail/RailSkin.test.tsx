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
    running: new Set(),
    loading: false,
    error: null,
    archivedView: false,
    archived: [],
    archivedLoading: false,
    archivedError: null,
    onSelect: () => {},
    onNewSession: () => {},
    onRefresh: () => {},
    onCollapse: () => {},
    onOpenSettings: () => {},
    onAddWorkspace: () => {},
    onToggleArchivedView: () => {},
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

  it("swaps the live list for archived sessions when the filter is on", () => {
    renderRail({
      sessions: [session],
      archivedView: true,
      archived: [
        {
          key: "games/one.jsonl.gz",
          id: "archived-one",
          cwd: "/projects/games",
          name: "Old chat",
          created: "2025-12-01T00:00:00.000Z",
          archivedAt: new Date().toISOString(),
          messageCount: 3,
          firstMessage: "old",
          size: 123,
        },
      ],
    });

    expect(screen.queryByRole("button", { name: "First session" })).toBeNull();
    expect(screen.getByText("Old chat")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show live sessions" })).toBeTruthy();
  });
});
