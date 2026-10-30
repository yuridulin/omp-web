import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LspDiagnostic } from "@/api/lsp";
import {
  applyLspDiagnosticsFrame,
  clearLspRoot,
  getLspRevision,
  removeLspDiagnostics,
  setLspDiagnostics,
  useAllDiagnostics,
  useLspDiagnostics,
} from "./lsp-store";

const diagnostic: LspDiagnostic = {
  range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
  message: "bad",
  severity: 1,
};

afterEach(cleanup);

beforeEach(() => {
  clearLspRoot("/repo");
  clearLspRoot("/other");
});

describe("LSP diagnostics store", () => {
  it("publishes diagnostics to the document and all-diagnostics hooks", () => {
    const single = renderHook(() => useLspDiagnostics("/repo", "/repo/a.ts"));
    const all = renderHook(() => useAllDiagnostics(["/repo"]));
    expect(single.result.current).toBeNull();
    expect(all.result.current).toEqual([]);

    act(() => setLspDiagnostics("/repo", "/repo/a.ts", [diagnostic], 1, "typescript"));

    expect(single.result.current).toMatchObject({
      root: "/repo",
      path: "/repo/a.ts",
      server: "typescript",
      version: 1,
      diagnostics: [diagnostic],
    });
    expect(all.result.current.map((document) => document.path)).toEqual(["/repo/a.ts"]);
  });

  it("ignores duplicate diagnostics and bumps the revision on changes", () => {
    setLspDiagnostics("/repo", "/repo/a.ts", [diagnostic], 1);
    const revision = getLspRevision();
    setLspDiagnostics("/repo", "/repo/a.ts", [diagnostic], 1);
    expect(getLspRevision()).toBe(revision);

    setLspDiagnostics("/repo", "/repo/a.ts", [diagnostic], 2);
    expect(getLspRevision()).toBe(revision + 1);
    expect(snapshotFor("/repo", "/repo/a.ts")?.version).toBe(2);
  });

  it("removes a document and clears a whole root", () => {
    setLspDiagnostics("/repo", "/repo/a.ts", [diagnostic], 1);
    removeLspDiagnostics("/repo", "/repo/a.ts");
    expect(snapshotFor("/repo", "/repo/a.ts")).toBeNull();

    setLspDiagnostics("/repo", "/repo/a.ts", [diagnostic], 1);
    setLspDiagnostics("/repo", "/repo/b.ts", [diagnostic], 1);
    clearLspRoot("/repo");
    expect(snapshotFor("/repo", "/repo/a.ts")).toBeNull();
    expect(snapshotFor("/repo", "/repo/b.ts")).toBeNull();
  });

  it("accepts SSE frames and rejects malformed ones", () => {
    act(() => {
      applyLspDiagnosticsFrame({
        type: "lsp-diagnostics",
        root: "/repo",
        path: "/repo/a.ts",
        version: 3,
        diagnostics: [diagnostic],
      });
    });
    expect(snapshotFor("/repo", "/repo/a.ts")?.version).toBe(3);

    applyLspDiagnosticsFrame({ type: "other", root: "/repo", path: "/repo/a.ts" });
    applyLspDiagnosticsFrame({ type: "lsp-diagnostics", root: 1, path: "/repo/a.ts" });
    applyLspDiagnosticsFrame({ type: "lsp-diagnostics", root: "/repo", path: "/repo/a.ts", diagnostics: "nope" });
    expect(snapshotFor("/repo", "/repo/a.ts")?.version).toBe(3);
  });

  it("removes a document on the close frame", () => {
    setLspDiagnostics("/repo", "/repo/a.ts", [diagnostic], 1);
    applyLspDiagnosticsFrame({
      type: "lsp-diagnostics",
      root: "/repo",
      path: "/repo/a.ts",
      version: 0,
      diagnostics: [],
    });
    expect(snapshotFor("/repo", "/repo/a.ts")).toBeNull();
  });

  it("filters diagnostics by the visible roots", () => {
    setLspDiagnostics("/repo", "/repo/a.ts", [diagnostic], 1);
    setLspDiagnostics("/other", "/other/b.ts", [diagnostic], 1);
    const all = renderHook(() => useAllDiagnostics(["/repo"]));
    expect(all.result.current.map((document) => document.path)).toEqual(["/repo/a.ts"]);
  });
});

function snapshotFor(root: string, path: string) {
  return renderHook(() => useLspDiagnostics(root, path)).result.current;
}
