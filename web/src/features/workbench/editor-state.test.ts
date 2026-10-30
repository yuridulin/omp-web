import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearEditorDraft,
  forgetEditorTab,
  getEditorDraft,
  isTabDirty,
  renameEditorTab,
  resetEditorState,
  setEditorDraft,
  useDirtyTabIds,
} from "./editor-state";

beforeEach(() => {
  resetEditorState();
});

describe("editor drafts", () => {
  it("tracks a draft per tab and reports dirty only when a draft exists", () => {
    expect(getEditorDraft("file:a.ts")).toBeNull();
    expect(isTabDirty("file:a.ts")).toBe(false);

    setEditorDraft("file:a.ts", { content: "next", baseContent: "base" });
    expect(getEditorDraft("file:a.ts")).toEqual({ content: "next", baseContent: "base" });
    expect(isTabDirty("file:a.ts")).toBe(true);
    expect(getEditorDraft("file:b.ts")).toBeNull();

    clearEditorDraft("file:a.ts");
    expect(isTabDirty("file:a.ts")).toBe(false);
  });

  it("moves a draft when a tab is renamed and forgets it when closed", () => {
    setEditorDraft("file:a.ts", { content: "edited", baseContent: "base" });
    renameEditorTab("file:a.ts", "file:b.ts");

    expect(getEditorDraft("file:a.ts")).toBeNull();
    expect(getEditorDraft("file:b.ts")).toEqual({ content: "edited", baseContent: "base" });

    forgetEditorTab("file:b.ts");
    expect(isTabDirty("file:b.ts")).toBe(false);
  });

  it("clears every draft on reset", () => {
    setEditorDraft("file:a.ts", { content: "a", baseContent: "" });
    setEditorDraft("file:b.ts", { content: "b", baseContent: "" });
    resetEditorState();
    expect(isTabDirty("file:a.ts")).toBe(false);
    expect(isTabDirty("file:b.ts")).toBe(false);
  });

  it("keeps a stable dirty snapshot between updates", () => {
    const { result } = renderHook(() => useDirtyTabIds());
    const first = result.current;

    act(() => {
      setEditorDraft("file:a.ts", { content: "edited", baseContent: "" });
    });

    expect(result.current).not.toBe(first);
    expect(result.current.has("file:a.ts")).toBe(true);

    const second = result.current;
    act(() => {
      setEditorDraft("file:a.ts", { content: "edited again", baseContent: "" });
    });
    expect(result.current).toBe(second);
  });
});
