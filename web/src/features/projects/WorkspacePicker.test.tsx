import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ listing: vi.fn() }));

vi.mock("@/api/workspace", () => ({
  fetchDirectoryListing: mocks.listing,
}));

import type { DirectoryListing } from "@/api/workspace";
import { WorkspacePicker } from "./WorkspacePicker";

function listing(overrides: Partial<DirectoryListing> & Pick<DirectoryListing, "path">): DirectoryListing {
  return { parentPath: null, directories: [], ...overrides };
}

beforeEach(() => {
  mocks.listing.mockReset();
});

afterEach(cleanup);

describe("WorkspacePicker", () => {
  it("lists Windows drives when the server has no start directory", async () => {
    mocks.listing.mockResolvedValue(
      listing({
        path: "",
        drives: [
          { name: "C:", path: "C:\\" },
          { name: "D:", path: "D:\\" },
        ],
      }),
    );

    render(<WorkspacePicker onChoose={vi.fn()} onClose={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "D:" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add folder" })).toHaveProperty("disabled", true);

    mocks.listing.mockResolvedValue(listing({ path: "D:\\", directories: [{ name: "Work", path: "D:\\Work" }] }));
    fireEvent.click(screen.getByRole("button", { name: "D:" }));

    expect(await screen.findByRole("button", { name: "Work/" })).toBeTruthy();
    expect(mocks.listing).toHaveBeenLastCalledWith("D:\\");
  });

  it("adds the folder it is showing", async () => {
    mocks.listing.mockResolvedValue(
      listing({ path: "D:\\Work", directories: [{ name: "omp-web", path: "D:\\Work\\omp-web" }] }),
    );
    const onChoose = vi.fn(async () => {});
    render(<WorkspacePicker onChoose={onChoose} onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Add folder" }));

    await waitFor(() => expect(onChoose).toHaveBeenCalledWith("D:\\Work"));
  });

  it("shows the server's error when a folder cannot be listed", async () => {
    mocks.listing.mockResolvedValueOnce(listing({ path: "D:\\Work" }));
    render(<WorkspacePicker onChoose={vi.fn()} onClose={vi.fn()} />);
    await screen.findByDisplayValue("D:\\Work");

    mocks.listing.mockRejectedValue(new Error("Directory does not exist"));
    fireEvent.change(screen.getByLabelText("Folder path"), { target: { value: "D:\\nope" } });
    fireEvent.keyDown(screen.getByLabelText("Folder path"), { key: "Enter" });

    expect(await screen.findByText("Directory does not exist")).toBeTruthy();
  });

  it("closes on Escape", async () => {
    mocks.listing.mockResolvedValue(listing({ path: "D:\\Work" }));
    const onClose = vi.fn();
    render(<WorkspacePicker onChoose={vi.fn()} onClose={onClose} />);
    await screen.findByDisplayValue("D:\\Work");

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
  });
});
