import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearLspRoot, setLspDiagnostics } from "@/state/lsp-store";
import { ProblemsList } from "./ProblemsList";

const diagnostic = {
  range: { start: { line: 2, character: 0 }, end: { line: 2, character: 3 } },
  message: "bad name",
  severity: 1,
} as const;

beforeEach(() => clearLspRoot("/repo"));
afterEach(cleanup);

describe("ProblemsList", () => {
  it("lists only documents with diagnostics", () => {
    setLspDiagnostics("/repo", "/repo/clean.ts", [], null);
    setLspDiagnostics("/repo", "/repo/bad.ts", [diagnostic], 1);

    render(<ProblemsList roots={["/repo"]} onOpen={() => {}} />);

    expect(screen.getByText("bad.ts")).toBeTruthy();
    expect(screen.queryByText("clean.ts")).toBeNull();
  });

  it("shows the empty state when every open document is clean", () => {
    setLspDiagnostics("/repo", "/repo/clean.ts", [], null);

    render(<ProblemsList roots={["/repo"]} onOpen={() => {}} />);

    expect(screen.getByText("No problems.")).toBeTruthy();
  });
});
