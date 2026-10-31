import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { LspDiagnostic } from "@/api/lsp";
import type { LspDocumentState } from "@/state/lsp-store";
import { ProblemsList } from "./ProblemsList";

const diagnostic = {
  range: { start: { line: 2, character: 0 }, end: { line: 2, character: 3 } },
  message: "bad name",
  severity: 1,
} as const;

function document(path: string, diagnostics: LspDiagnostic[]): LspDocumentState {
  return { root: "/repo", path, server: null, available: true, version: 1, diagnostics };
}

afterEach(cleanup);

describe("ProblemsList", () => {
  it("lists only documents with diagnostics", () => {
    render(
      <ProblemsList
        documents={[
          document("/repo/clean.ts", []),
          document("/repo/bad.ts", [diagnostic]),
        ]}
        onOpen={() => {}}
      />,
    );

    expect(screen.getByText("bad.ts")).toBeTruthy();
    expect(screen.queryByText("clean.ts")).toBeNull();
  });

  it("shows the empty state when every open document is clean", () => {
    render(<ProblemsList documents={[document("/repo/clean.ts", [])]} onOpen={() => {}} />);

    expect(screen.getByText("No problems.")).toBeTruthy();
  });
});
