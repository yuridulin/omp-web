import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectSummary } from "@/api/workspace";
import { RailSkin } from "./RailSkin";

vi.mock("@/features/notifications/NotificationBell", () => ({
  NotificationBell: () => null,
}));

afterEach(cleanup);

const projects = [
  { path: "/projects/games", alias: "Games" },
] as unknown as ProjectSummary[];

function renderRail(onNewSession: (projectPath?: string) => void) {
  render(
    <RailSkin
      sessions={[]}
      projects={projects}
      selected={null}
      running={new Set()}
      loading={false}
      error={null}
      onSelect={() => {}}
      onNewSession={onNewSession}
      onRefresh={() => {}}
      onCollapse={() => {}}
      onOpenSettings={() => {}}
    />,
  );
}

describe("rail new session entry point", () => {
  it("creates from a project header with that root", () => {
    const onNewSession = vi.fn();
    renderRail(onNewSession);

    expect(screen.queryByRole("button", { name: "New session" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "New session in Games" }));

    expect(onNewSession).toHaveBeenCalledWith("/projects/games");
  });
});
