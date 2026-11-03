import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkbenchTab } from "@/layout/layout-store";
import { testTranscriptClasses } from "@/features/chat/test-classes";
import { EditorArea, retainTerminals } from "./EditorArea";

vi.mock("./TerminalView", () => ({
  TerminalView: () => <div data-testid="terminal-view" />,
}));

afterEach(cleanup);

function terminal(id: string): WorkbenchTab {
  return { id, kind: "terminal", path: "", title: id, terminalCwd: "D:/repo" };
}

describe("retainTerminals", () => {
  it("mounts the active terminal first and keeps it after another tab is shown", () => {
    const tabs = [terminal("t1"), terminal("t2")];
    const first = retainTerminals([], tabs, "t1");
    expect(first).toEqual(["t1"]);
    expect(retainTerminals(first, tabs, "t2")).toEqual(["t1", "t2"]);
  });

  it("drops a terminal once its tab is gone", () => {
    expect(retainTerminals(["t1", "t2"], [terminal("t2")], "t2")).toEqual(["t2"]);
  });
});

describe("EditorArea terminals", () => {
  it("does not mount a terminal tab until it has been shown", async () => {
    const tabs = [terminal("t1"), terminal("t2")];
    const { container, rerender } = render(
      <EditorArea
        sessionId="s1"
        primaryRoot="D:/repo"
        roots={["D:/repo"]}
        tabs={tabs}
        activeTabId="t1"
        transcriptClasses={testTranscriptClasses}
        onTabScroll={() => {}}
      />,
    );

    await waitFor(() => expect(container.querySelectorAll("[data-terminal-id]").length).toBe(1));
    expect(container.querySelector("[data-terminal-id='t1']")).toBeTruthy();

    rerender(
      <EditorArea
        sessionId="s1"
        primaryRoot="D:/repo"
        roots={["D:/repo"]}
        tabs={tabs}
        activeTabId="t2"
        transcriptClasses={testTranscriptClasses}
        onTabScroll={() => {}}
      />,
    );

    expect(container.querySelectorAll("[data-terminal-id]").length).toBe(2);
    expect(container.querySelector("[data-terminal-id='t2']")?.getAttribute("style")).toContain("display: flex");
    expect(container.querySelector("[data-terminal-id='t1']")?.getAttribute("style")).toContain("display: none");
  });
});
