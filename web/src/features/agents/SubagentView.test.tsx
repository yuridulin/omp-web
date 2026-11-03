import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SubagentRow, SubagentsFrame } from "@/api/subagents";
import { testTranscriptClasses } from "@/features/chat/test-classes";
import { applySubagentsFrame, resetSubagentRosters } from "@/state/subagents-store";

const fetchSubagentPage = vi.fn();

vi.mock("@/api/subagents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/subagents")>();
  return { ...actual, fetchSubagentPage: (...args: unknown[]) => fetchSubagentPage(...args) };
});

vi.mock("@/api/lsp", () => ({
  closeLspDocument: vi.fn(async () => ({ closed: true })),
}));

const { SubagentView } = await import("./SubagentView");

const row: SubagentRow = {
  id: "Scout",
  agent: "scout",
  status: "completed",
  index: 0,
  transcriptAvailable: true,
  task: "Map the workbench",
  durationMs: 74_000,
  tokens: 12_400,
  resolvedModel: "provider/deepseek-v4.1-flash:high",
} as SubagentRow;

const frame: SubagentsFrame = {
  type: "subagents",
  revision: 1,
  live: true,
  roster: [row],
  activity: {},
  transcriptVersions: {},
};

beforeEach(() => {
  resetSubagentRosters();
  fetchSubagentPage.mockReset();
});

afterEach(cleanup);

describe("SubagentView", () => {
  it("renders the roster header and the read-only transcript", async () => {
    applySubagentsFrame("s1", frame);
    fetchSubagentPage.mockResolvedValue({
      fromByte: 0,
      nextByte: 900,
      reset: false,
      messages: [
        { role: "user", content: "Map the workbench", timestamp: 1 },
        { role: "assistant", content: "Tabs are a union on kind.", timestamp: 2 },
      ],
      totalBytes: 900,
    });

    render(<SubagentView sessionId="s1" subagentId="Scout" classes={testTranscriptClasses} />);

    expect(screen.getByText("Scout")).toBeTruthy();
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.getByText("1m 14s")).toBeTruthy();
    expect(screen.getByText(/deepseek-v4\.1-flash · high/)).toBeTruthy();
    expect(screen.getByText("Map the workbench")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Tabs are a union on kind.")).toBeTruthy());
    expect(screen.getByText(/drive the parent chat instead/)).toBeTruthy();
  });

  it("explains an empty transcript instead of showing a blank panel", async () => {
    applySubagentsFrame("s1", { ...frame, roster: [{ ...row, status: "started" }] });
    fetchSubagentPage.mockResolvedValue({ fromByte: 0, nextByte: 0, reset: false, messages: [], totalBytes: 0 });

    render(<SubagentView sessionId="s1" subagentId="Scout" classes={testTranscriptClasses} />);

    await waitFor(() => expect(screen.getByText("This agent has not written anything yet.")).toBeTruthy());
    expect(screen.getByText("Working")).toBeTruthy();
  });
});

describe("SubagentView task block", () => {
  const longPrompt = [
    "Complete assignment thoroughly:",
    "",
    "# Target",
    "Rewrite protocol.ts to the frozen spec.",
    "",
    "# Change",
    "1. Keep MAX_PLAYERS = 8.",
    "2. Add STARTING_LIFE and the wire view types.",
  ].join(String.fromCharCode(10));

  it("lets the reader expand the agent's prompt instead of clipping it", async () => {
    applySubagentsFrame("s1", { ...frame, roster: [{ ...row, task: longPrompt }] });
    fetchSubagentPage.mockResolvedValue({ fromByte: 0, nextByte: 0, reset: false, messages: [], totalBytes: 0 });

    render(<SubagentView sessionId="s1" subagentId="Scout" classes={testTranscriptClasses} />);

    const toggle = screen.getByRole("button", { name: "Show full prompt" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);

    const collapse = screen.getByRole("button", { name: "Show less" });
    expect(collapse.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/Add STARTING_LIFE and the wire view types/)).toBeTruthy();
  });

  it("does not offer a toggle for a short task", async () => {
    applySubagentsFrame("s1", { ...frame, roster: [{ ...row, task: "Map the workbench" }] });
    fetchSubagentPage.mockResolvedValue({ fromByte: 0, nextByte: 0, reset: false, messages: [], totalBytes: 0 });

    render(<SubagentView sessionId="s1" subagentId="Scout" classes={testTranscriptClasses} />);

    await waitFor(() => expect(screen.getByText("Map the workbench")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Show full prompt|Show less/ })).toBeNull();
  });
});
