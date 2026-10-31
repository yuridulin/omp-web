import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/lsp", () => ({
  closeLspDocument: vi.fn(async () => ({ closed: true })),
}));

import {
  addWorkbenchRoot,
  closeTab,
  closeTabsForPath,
  diffTabId,
  diffTabTitle,
  ensureWorkbenchRoots,
  fileTabId,
  getLayout,
  getWorkbenchContext,
  openDiffTab,
  openFileTab,
  openTerminalTab,
  removeWorkbenchRoot,
  renameFileTabs,
  resetLayoutForTests,
  setActiveTab,
  setTabScroll,
  terminalTabId,
  updateLayout,
} from "./layout-store";

describe("layout store", () => {
  beforeEach(() => {
    resetLayoutForTests();
    localStorage.clear();
  });

  it("persists and clamps the global layout", () => {
    expect(getLayout().railWidth).toBe(248);
    updateLayout({ railWidth: 999, workbenchWidth: 100 });
    expect(getLayout().railWidth).toBe(420);
    expect(getLayout().workbenchWidth).toBe(360);
    expect(JSON.parse(localStorage.getItem("omp.layout.v1") ?? "{}")).toMatchObject({
      railWidth: 420,
      workbenchWidth: 360,
    });
  });

  it("keeps file tabs per session and replaces previews", () => {
    ensureWorkbenchRoots("s1", "D:/repo");
    openFileTab("s1", "D:/repo/a.ts", true);
    openFileTab("s1", "D:/repo/b.ts", true);
    let context = getWorkbenchContext("s1");
    expect(context.tabs.map((tab) => tab.path)).toEqual(["D:/repo/b.ts"]);
    expect(context.activeTabId).toBe(fileTabId("D:/repo/b.ts"));

    openFileTab("s1", "D:/repo/b.ts");
    openFileTab("s1", "D:/repo/c.ts");
    context = getWorkbenchContext("s1");
    expect(context.tabs.map((tab) => tab.path)).toEqual(["D:/repo/b.ts", "D:/repo/c.ts"]);
    expect(context.tabs[0]?.preview).toBe(false);

    openFileTab("s2", "D:/repo/z.ts");
    expect(getWorkbenchContext("s1").tabs).toHaveLength(2);
    expect(getWorkbenchContext("s2").tabs).toHaveLength(1);
  });

  it("deduplicates diff tabs by source and keeps them across session switches", () => {
    ensureWorkbenchRoots("s1", "D:/repo");
    const source = { kind: "working" as const, cwd: "D:/repo", path: "D:/repo/a.ts", from: "HEAD", to: "WORKTREE" };
    openDiffTab("s1", source);
    openDiffTab("s1", source);
    expect(getWorkbenchContext("s1").tabs).toHaveLength(1);
    expect(getWorkbenchContext("s1").tabs[0]?.title).toBe("a.ts (HEAD ↔ working)");
    expect(getWorkbenchContext("s1").activeTabId).toBe(diffTabId(source));
    expect(diffTabTitle(source)).toBe("a.ts (HEAD ↔ working)");
  });

  it("closes the active tab and selects its neighbour", () => {
    ensureWorkbenchRoots("s1", "D:/repo");
    openFileTab("s1", "D:/repo/a.ts");
    openFileTab("s1", "D:/repo/b.ts");
    setActiveTab("s1", fileTabId("D:/repo/a.ts"));
    closeTab("s1", fileTabId("D:/repo/a.ts"));
    expect(getWorkbenchContext("s1").activeTabId).toBe(fileTabId("D:/repo/b.ts"));
    expect(getWorkbenchContext("s1").tabs).toHaveLength(1);
  });

  it("moves a changed primary root first without resetting tabs", () => {
    ensureWorkbenchRoots("s1", "D:/repo");
    addWorkbenchRoot("s1", "D:/extra");
    openFileTab("s1", "D:/repo/a.ts");
    ensureWorkbenchRoots("s1", "D:/other");
    const context = getWorkbenchContext("s1");
    expect(context.roots).toEqual(["D:/other", "D:/repo", "D:/extra"]);
    expect(context.tabs).toHaveLength(1);
    ensureWorkbenchRoots("s1", "D:/other");
    expect(getWorkbenchContext("s1").roots).toEqual(["D:/other", "D:/repo", "D:/extra"]);
  });

  it("opens one terminal tab per cwd and persists it", () => {
    ensureWorkbenchRoots("s1", "D:/repo");
    openTerminalTab("s1", "D:/repo");
    openTerminalTab("s1", "D:\\repo\\");
    openTerminalTab("s1", "D:/repo/apps/web");
    const context = getWorkbenchContext("s1");
    expect(context.tabs).toHaveLength(2);
    const [first] = context.tabs;
    expect(first?.id).toBe(terminalTabId("D:/repo"));
    expect(first?.kind).toBe("terminal");
    expect(first?.terminalCwd).toBe("D:/repo");
    expect(first?.title).toBe("repo");
    expect(context.activeTabId).toBe(terminalTabId("D:/repo/apps/web"));

    const stored = JSON.parse(localStorage.getItem("omp.workbench.v1.s1") ?? "{}") as {
      tabs?: { kind: string; terminalCwd?: string; title: string }[];
    };
    expect(stored.tabs?.map((tab) => [tab.kind, tab.terminalCwd, tab.title])).toEqual([
      ["terminal", "D:/repo", "repo"],
      ["terminal", "D:/repo/apps/web", "web"],
    ]);
  });

  it("restores valid terminal tabs and drops malformed ones", () => {
    localStorage.setItem("omp.workbench.v1.s3", JSON.stringify({
      root: "D:/repo",
      view: "files",
      tabs: [
        { id: terminalTabId("D:/repo"), kind: "terminal", path: "D:/repo", title: "repo", terminalCwd: "D:/repo" },
        { id: "terminal:broken", kind: "terminal", path: "D:/broken", title: "broken" },
        { id: fileTabId("D:/repo/a.ts"), kind: "file", path: "D:/repo/a.ts", title: "a.ts" },
        { id: "diff:bad", kind: "diff", path: "D:/repo/a.ts", title: "bad" },
        { id: "weird", kind: "weird", path: "x", title: "x" },
      ],
      activeTabId: terminalTabId("D:/repo"),
    }));
    const context = getWorkbenchContext("s3");
    expect(context.tabs.map((tab) => tab.id)).toEqual([terminalTabId("D:/repo"), fileTabId("D:/repo/a.ts")]);
    expect(context.tabs[0]?.kind).toBe("terminal");
    expect(context.tabs[0]?.terminalCwd).toBe("D:/repo");
    expect(context.activeTabId).toBe(terminalTabId("D:/repo"));
  });

  it("renames every open file tab under a renamed directory", () => {
    ensureWorkbenchRoots("s1", "D:/repo");
    openFileTab("s1", "D:/repo/src/a.ts");
    openFileTab("s1", "D:/repo/src/deep/b.ts");
    openFileTab("s1", "D:/repo/src2/c.ts");
    setActiveTab("s1", fileTabId("D:/repo/src/deep/b.ts"));

    const pairs = renameFileTabs("s1", "D:/repo/src", "D:/repo/lib");
    expect(pairs).toEqual([
      { fromId: fileTabId("D:/repo/src/a.ts"), toId: fileTabId("D:/repo/lib/a.ts") },
      { fromId: fileTabId("D:/repo/src/deep/b.ts"), toId: fileTabId("D:/repo/lib/deep/b.ts") },
    ]);

    const context = getWorkbenchContext("s1");
    expect(context.tabs.map((tab) => tab.path)).toEqual([
      "D:/repo/lib/a.ts",
      "D:/repo/lib/deep/b.ts",
      "D:/repo/src2/c.ts",
    ]);
    expect(context.tabs.map((tab) => tab.title)).toEqual(["a.ts", "b.ts", "c.ts"]);
    expect(context.tabs.map((tab) => tab.id)).toEqual([
      fileTabId("D:/repo/lib/a.ts"),
      fileTabId("D:/repo/lib/deep/b.ts"),
      fileTabId("D:/repo/src2/c.ts"),
    ]);
    expect(context.activeTabId).toBe(fileTabId("D:/repo/lib/deep/b.ts"));
  });

  it("keeps preview and scroll when a file tab is renamed", () => {
    ensureWorkbenchRoots("s1", "D:/repo");
    openFileTab("s1", "D:/repo/old.ts", true);
    setTabScroll("s1", fileTabId("D:/repo/old.ts"), 42);

    const pairs = renameFileTabs("s1", "D:/repo/old.ts", "D:/repo/new.ts");
    expect(pairs).toEqual([{ fromId: fileTabId("D:/repo/old.ts"), toId: fileTabId("D:/repo/new.ts") }]);
    const context = getWorkbenchContext("s1");
    expect(context.tabs[0]).toMatchObject({
      id: fileTabId("D:/repo/new.ts"),
      path: "D:/repo/new.ts",
      title: "new.ts",
      preview: true,
      scrollTop: 42,
    });
    expect(context.activeTabId).toBe(fileTabId("D:/repo/new.ts"));
    expect(renameFileTabs("s1", "D:/repo/old.ts", "D:/repo/new.ts")).toEqual([]);
  });

  it("closes file and diff tabs for a deleted directory and moves the active tab", () => {
    ensureWorkbenchRoots("s1", "D:/repo");
    const source = { kind: "working" as const, cwd: "D:/repo", path: "D:/repo/src/a.ts", from: "HEAD", to: "WORKTREE" };
    openFileTab("s1", "D:/repo/src/a.ts");
    openFileTab("s1", "D:/repo/src/b.ts");
    openFileTab("s1", "D:/repo/keep.ts");
    openDiffTab("s1", source);
    openTerminalTab("s1", "D:/repo/src");
    setActiveTab("s1", fileTabId("D:/repo/src/b.ts"));

    const closed = closeTabsForPath("s1", "D:/repo/src");
    expect(closed).toEqual([
      fileTabId("D:/repo/src/a.ts"),
      fileTabId("D:/repo/src/b.ts"),
      diffTabId(source),
    ]);

    const context = getWorkbenchContext("s1");
    expect(context.tabs.map((tab) => tab.id)).toEqual([
      fileTabId("D:/repo/keep.ts"),
      terminalTabId("D:/repo/src"),
    ]);
    // The active tab was closed; like closeTab it falls to the surviving neighbour.
    expect(context.activeTabId).toBe(fileTabId("D:/repo/keep.ts"));
  });

  it("migrates a legacy single root and accepts the problems view", () => {
    localStorage.setItem("omp.workbench.v1.legacy", JSON.stringify({
      root: "D:/repo",
      view: "problems",
      tabs: [],
    }));
    const context = getWorkbenchContext("legacy");
    expect(context.roots).toEqual(["D:/repo"]);
    expect(context.view).toBe("problems");
  });

  it("adds and removes non-primary roots, closing only their tabs", () => {
    ensureWorkbenchRoots("s1", "D:/repo");
    addWorkbenchRoot("s1", "D:/extra");
    addWorkbenchRoot("s1", "D:/repo");
    addWorkbenchRoot("s1", "D:/extra");
    expect(getWorkbenchContext("s1").roots).toEqual(["D:/repo", "D:/extra"]);
    openFileTab("s1", "D:/repo/a.ts");
    openFileTab("s1", "D:/extra/b.ts");
    openTerminalTab("s1", "D:/extra");

    expect(removeWorkbenchRoot("s1", "D:/repo")).toEqual([]);
    expect(getWorkbenchContext("s1").roots).toEqual(["D:/repo", "D:/extra"]);

    const closed = removeWorkbenchRoot("s1", "D:/extra");
    expect(closed).toEqual([fileTabId("D:/extra/b.ts"), terminalTabId("D:/extra")]);
    const context = getWorkbenchContext("s1");
    expect(context.roots).toEqual(["D:/repo"]);
    expect(context.tabs.map((tab) => tab.path)).toEqual(["D:/repo/a.ts"]);
    expect(context.activeTabId).toBe(fileTabId("D:/repo/a.ts"));
  });

  it("caps added roots at eight", () => {
    ensureWorkbenchRoots("s1", "D:/repo");
    for (let index = 0; index < 10; index += 1) addWorkbenchRoot("s1", `D:/extra-${index}`);
    expect(getWorkbenchContext("s1").roots).toHaveLength(8);
  });

  it("stores and updates a tab position", () => {
    ensureWorkbenchRoots("s1", "D:/repo");
    openFileTab("s1", "D:/repo/a.ts", false, { line: 3, column: 2 });
    expect(getWorkbenchContext("s1").tabs[0]?.position).toEqual({ line: 3, column: 2 });

    openFileTab("s1", "D:/repo/a.ts", false, { line: 7, column: 1 });
    expect(getWorkbenchContext("s1").tabs[0]?.position).toEqual({ line: 7, column: 1 });
    const stored = JSON.parse(localStorage.getItem("omp.workbench.v1.s1") ?? "{}") as {
      tabs?: { position?: { line: number; column: number } }[];
    };
    expect(stored.tabs?.[0]?.position).toEqual({ line: 7, column: 1 });
  });

  it("closes an inactive file tab without disturbing the active one", () => {
    ensureWorkbenchRoots("s1", "D:/repo");
    openFileTab("s1", "D:/repo/src/a.ts");
    openFileTab("s1", "D:/repo/src/a.ts.bak");
    setActiveTab("s1", fileTabId("D:/repo/src/a.ts.bak"));

    expect(closeTabsForPath("s1", "D:/repo/src/a.ts")).toEqual([fileTabId("D:/repo/src/a.ts")]);
    const context = getWorkbenchContext("s1");
    expect(context.tabs.map((tab) => tab.path)).toEqual(["D:/repo/src/a.ts.bak"]);
    expect(context.activeTabId).toBe(fileTabId("D:/repo/src/a.ts.bak"));
    expect(closeTabsForPath("s1", "D:/repo/missing")).toEqual([]);
  });
});
