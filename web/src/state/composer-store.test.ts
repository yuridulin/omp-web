import { beforeEach, describe, expect, it } from "vitest";
import { parseDragPayload, serializeDragPayload, type DragPayload } from "@/drag/payload";
import {
  appendComposerDraft,
  getComposerDraft,
  resetComposerStoreForTests,
  seedComposerDraft,
  setComposerDraft,
  subscribeComposerDraft,
} from "./composer-store";

beforeEach(() => {
  resetComposerStoreForTests();
});

describe("composer store", () => {
  it("keeps a separate draft per session and persists the documented key", () => {
    setComposerDraft("s1", "first");
    setComposerDraft("s2", "second");
    expect(getComposerDraft("s1")).toBe("first");
    expect(getComposerDraft("s2")).toBe("second");
    expect(localStorage.getItem("omp.composer.v1.s1")).toBe("first");
    expect(localStorage.getItem("omp.composer.v1.s2")).toBe("second");

    setComposerDraft("s1", "");
    expect(getComposerDraft("s2")).toBe("second");
    expect(localStorage.getItem("omp.composer.v1.s1")).toBeNull();
  });

  it("seeds from the server once and never overwrites typed text", () => {
    seedComposerDraft("s1", "server draft");
    expect(getComposerDraft("s1")).toBe("server draft");
    expect(localStorage.getItem("omp.composer.v1.s1")).toBeNull();

    setComposerDraft("s1", "typed");
    seedComposerDraft("s1", "stale server");
    expect(getComposerDraft("s1")).toBe("typed");
  });

  it("appends a decoded file drop without rendering the tree or composer", () => {
    const payload: DragPayload = { kind: "file", path: "D:/repo/a.ts", root: "D:/repo" };
    const decoded = parseDragPayload(serializeDragPayload(payload));
    expect(decoded).toEqual(payload);

    setComposerDraft("s1", "look at");
    if (decoded?.kind === "file") appendComposerDraft("s1", decoded.path);
    expect(getComposerDraft("s1")).toBe("look at D:/repo/a.ts");
    expect(localStorage.getItem("omp.composer.v1.s1")).toBe("look at D:/repo/a.ts");

    appendComposerDraft("s1", "D:/repo/b.ts");
    expect(getComposerDraft("s1")).toBe("look at D:/repo/a.ts D:/repo/b.ts");
  });

  it("notifies subscribers on writes", () => {
    let calls = 0;
    const unsubscribe = subscribeComposerDraft(() => {
      calls += 1;
    });
    setComposerDraft("s1", "a");
    setComposerDraft("s1", "a");
    setComposerDraft("s1", "b");
    unsubscribe();
    setComposerDraft("s1", "c");
    expect(calls).toBe(2);
  });
});
