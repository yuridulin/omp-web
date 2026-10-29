import { beforeEach, describe, expect, it } from "vitest";
import {
  closeTab,
  diffTabId,
  diffTabTitle,
  ensureWorkbenchRoot,
  fileTabId,
  getLayout,
  getWorkbenchContext,
  openDiffTab,
  openFileTab,
  resetLayoutForTests,
  setActiveTab,
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
    ensureWorkbenchRoot("s1", "D:/repo");
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
    ensureWorkbenchRoot("s1", "D:/repo");
    const source = { kind: "working" as const, cwd: "D:/repo", path: "D:/repo/a.ts", from: "HEAD", to: "WORKTREE" };
    openDiffTab("s1", source);
    openDiffTab("s1", source);
    expect(getWorkbenchContext("s1").tabs).toHaveLength(1);
    expect(getWorkbenchContext("s1").tabs[0]?.title).toBe("a.ts (HEAD ↔ working)");
    expect(getWorkbenchContext("s1").activeTabId).toBe(diffTabId(source));
    expect(diffTabTitle(source)).toBe("a.ts (HEAD ↔ working)");
  });

  it("closes the active tab and selects its neighbour", () => {
    ensureWorkbenchRoot("s1", "D:/repo");
    openFileTab("s1", "D:/repo/a.ts");
    openFileTab("s1", "D:/repo/b.ts");
    setActiveTab("s1", fileTabId("D:/repo/a.ts"));
    closeTab("s1", fileTabId("D:/repo/a.ts"));
    expect(getWorkbenchContext("s1").activeTabId).toBe(fileTabId("D:/repo/b.ts"));
    expect(getWorkbenchContext("s1").tabs).toHaveLength(1);
  });

  it("resets the workbench context when the session root changes", () => {
    ensureWorkbenchRoot("s1", "D:/repo");
    openFileTab("s1", "D:/repo/a.ts");
    ensureWorkbenchRoot("s1", "D:/other");
    const context = getWorkbenchContext("s1");
    expect(context.root).toBe("D:/other");
    expect(context.tabs).toHaveLength(0);
  });
});
