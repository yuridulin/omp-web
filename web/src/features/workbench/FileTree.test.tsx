import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FileEntry, GitFileStatus } from "@/api/workspace";
import { FileTree } from "./FileTree";

const mocks = vi.hoisted(() => ({
  useFileList: vi.fn(),
  createFile: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("./use-workbench-data", () => ({
  useFileList: mocks.useFileList,
}));

vi.mock("./use-file-mutations", () => ({
  useFileMutations: () => ({
    createFile: mocks.createFile,
    rename: mocks.rename,
    remove: mocks.remove,
    upload: mocks.upload,
    pending: false,
    error: null,
  }),
}));

const ROOT = "/repo";

function entry(name: string, isDir = false): FileEntry {
  return { name, isDir, size: 0, modified: "" };
}

function renderTree(options: {
  entries: FileEntry[];
  gitFiles?: GitFileStatus[];
  onRenamed?: (from: string, to: string) => void;
  onDeleted?: (path: string) => void;
}) {
  mocks.useFileList.mockReturnValue({
    isLoading: false,
    isError: false,
    data: { path: ROOT, entries: options.entries },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onToggle = vi.fn();
  const onOpen = vi.fn();
  const onScroll = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <FileTree
        sessionId="session"
        roots={[ROOT]}
        expanded={[]}
        gitFilesByRoot={new Map([[ROOT, options.gitFiles ?? []]])}
        scrollTop={0}
        onToggle={onToggle}
        onOpen={onOpen}
        onScroll={onScroll}
        {...(options.onRenamed ? { onRenamed: options.onRenamed } : {})}
        {...(options.onDeleted ? { onDeleted: options.onDeleted } : {})}
      />
    </QueryClientProvider>,
  );
  return { onToggle, onOpen };
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createFile.mockResolvedValue(undefined);
  mocks.rename.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined);
  mocks.upload.mockResolvedValue({ uploaded: [], skipped: [], errors: [] });
});

describe("FileTree actions", () => {
  it("creates a new file relative to the workspace root and opens it", async () => {
    const { onOpen } = renderTree({ entries: [entry("a.ts")] });

    fireEvent.click(screen.getByTitle("New file"));
    const input = screen.getByPlaceholderText("path/inside/workspace.ts");
    fireEvent.change(input, { target: { value: "src/new.ts" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(mocks.createFile).toHaveBeenCalledWith("/repo/src/new.ts"));
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith("/repo/src/new.ts", false));
  });

  it("renames a file inline and reports the new path", async () => {
    const onRenamed = vi.fn();
    renderTree({ entries: [entry("a.ts")], onRenamed });

    fireEvent.click(screen.getByTitle("Rename a.ts"));
    const input = screen.getByLabelText("Rename a.ts");
    fireEvent.change(input, { target: { value: "b.ts" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(mocks.rename).toHaveBeenCalledWith("/repo/a.ts", "/repo/b.ts"));
    await waitFor(() => expect(onRenamed).toHaveBeenCalledWith("/repo/a.ts", "/repo/b.ts"));
  });

  it("deletes a file after inline confirmation", async () => {
    const onDeleted = vi.fn();
    renderTree({ entries: [entry("a.ts")], onDeleted });

    fireEvent.click(screen.getByTitle("Delete a.ts"));
    expect(screen.getByText("Delete a.ts?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("/repo/a.ts", false));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("/repo/a.ts"));
  });

  it("deletes directories recursively", async () => {
    renderTree({ entries: [entry("src", true)] });

    fireEvent.click(screen.getByTitle("Delete src"));
    expect(screen.getByText("Delete src (directory)?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("/repo/src", true));
  });

  it("keeps preview/pin opens and directory toggles", () => {
    const { onToggle, onOpen } = renderTree({ entries: [entry("src", true), entry("a.ts")] });

    fireEvent.click(screen.getByTitle("/repo/src"));
    expect(onToggle).toHaveBeenCalledWith("/repo/src");

    fireEvent.click(screen.getByTitle("/repo/a.ts"));
    expect(onOpen).toHaveBeenCalledWith("/repo/a.ts", true);

    fireEvent.doubleClick(screen.getByTitle("/repo/a.ts"));
    expect(onOpen).toHaveBeenCalledWith("/repo/a.ts", false);
  });
});
