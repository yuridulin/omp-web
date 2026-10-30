import type { LspDiagnostic } from "@/api/lsp";

/**
 * Shape-compatible with `monaco.editor.IMarkerData` but without importing the
 * Monaco runtime into the eager chat bundle.
 */
export interface LspMarker {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  message: string;
  severity: number;
  source?: string;
}

/** LSP severities are 1..4; Monaco's numeric values are Error 8, Warning 4, Info 2, Hint 1. */
const SEVERITY: Record<number, number> = {
  1: 8,
  2: 4,
  3: 2,
  4: 1,
};

/**
 * LSP positions are 0-based; Monaco markers are 1-based. Unknown severities
 * render as warnings, and inverted ranges collapse to their start.
 */
export function markersFromDiagnostics(diagnostics: readonly LspDiagnostic[]): LspMarker[] {
  return diagnostics.map((diagnostic) => {
    const startLine = diagnostic.range.start.line + 1;
    const startColumn = diagnostic.range.start.character + 1;
    const endLine = Math.max(startLine, diagnostic.range.end.line + 1);
    const endColumn = Math.max(endLine === startLine ? startColumn : 1, diagnostic.range.end.character + 1);
    const marker: LspMarker = {
      startLineNumber: startLine,
      startColumn,
      endLineNumber: endLine,
      endColumn,
      message: diagnostic.message,
      severity: SEVERITY[diagnostic.severity ?? 0] ?? 4,
    };
    if (diagnostic.source !== undefined) marker.source = diagnostic.source;
    return marker;
  });
}
