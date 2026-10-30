import { describe, expect, it } from "vitest";
import type { LspDiagnostic } from "@/api/lsp";
import { markersFromDiagnostics } from "./lsp-markers";

function diagnostic(overrides: Partial<LspDiagnostic> = {}): LspDiagnostic {
  return {
    range: {
      start: { line: 0, character: 1 },
      end: { line: 2, character: 3 },
    },
    message: "problem",
    ...overrides,
  };
}

describe("LSP marker mapping", () => {
  it("converts 0-based positions to 1-based markers", () => {
    expect(markersFromDiagnostics([diagnostic()])).toEqual([
      {
        startLineNumber: 1,
        startColumn: 2,
        endLineNumber: 3,
        endColumn: 4,
        message: "problem",
        severity: 4,
      },
    ]);
  });

  it("maps LSP severities to Monaco numbers and defaults to warning", () => {
    const severities = ([1, 2, 3, 4, undefined] as const).map(
      (severity) => markersFromDiagnostics([diagnostic(severity === undefined ? {} : { severity })])[0]?.severity,
    );
    expect(severities).toEqual([8, 4, 2, 1, 4]);
  });

  it("clamps inverted and cross-line ranges", () => {
    const [marker] = markersFromDiagnostics([
      diagnostic({
        range: {
          start: { line: 4, character: 6 },
          end: { line: 2, character: 1 },
        },
      }),
    ]);
    expect(marker).toMatchObject({ startLineNumber: 5, startColumn: 7, endLineNumber: 5, endColumn: 7 });

    const [across] = markersFromDiagnostics([
      diagnostic({
        range: {
          start: { line: 1, character: 5 },
          end: { line: 3, character: 0 },
        },
      }),
    ]);
    expect(across).toMatchObject({ startLineNumber: 2, startColumn: 6, endLineNumber: 4, endColumn: 1 });
  });

  it("keeps the source when the server sends one", () => {
    const [marker] = markersFromDiagnostics([diagnostic({ source: "typescript" })]);
    expect(marker?.source).toBe("typescript");
  });
});
