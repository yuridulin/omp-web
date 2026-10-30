import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CwdListing } from "@/api/agent";
import { CwdPicker } from "./CwdPicker";

const browseCwdMock = vi.hoisted(() => vi.fn());

vi.mock("@/api/agent", () => ({ browseCwd: browseCwdMock }));

afterEach(cleanup);

beforeEach(() => {
  browseCwdMock.mockReset();
});

function listing(overrides: Partial<CwdListing> = {}): CwdListing {
  return {
    path: "C:/work",
    parentPath: "C:/",
    directories: [],
    drives: [],
    ...overrides,
  };
}

describe("CwdPicker", () => {
  it("lists the current folder and applies it", async () => {
    browseCwdMock.mockResolvedValue(
      listing({ directories: [{ name: "src", path: "C:/work/src" }] }),
    );
    const onChange = vi.fn();

    render(<CwdPicker value="C:/work" onChange={onChange} />);

    expect(await screen.findByRole("button", { name: /src/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use this folder" }));

    expect(browseCwdMock).toHaveBeenCalledWith("C:/work");
    expect(onChange).toHaveBeenCalledWith("C:/work");
  });

  it("navigates into a subdirectory", async () => {
    browseCwdMock
      .mockResolvedValueOnce(listing({ directories: [{ name: "src", path: "C:/work/src" }] }))
      .mockResolvedValueOnce(
        listing({ path: "C:/work/src", parentPath: "C:/work", directories: [] }),
      );

    render(<CwdPicker value="C:/work" onChange={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /src/ }));

    expect(await screen.findByText("C:/work/src")).toBeTruthy();
    expect(browseCwdMock).toHaveBeenLastCalledWith("C:/work/src");
    expect(screen.getByRole("button", { name: /parent/ })).toBeTruthy();
  });

  it("lists drives when no path is available", async () => {
    browseCwdMock.mockResolvedValue(
      listing({
        path: "",
        parentPath: null,
        drives: [{ name: "C:", path: "C:/" }],
      }),
    );

    render(<CwdPicker value="" onChange={() => {}} />);

    expect(await screen.findByRole("button", { name: /C:/ })).toBeTruthy();
    expect(browseCwdMock).toHaveBeenCalledWith(undefined);
  });

  it("surfaces browse errors and refuses to apply", async () => {
    browseCwdMock.mockRejectedValue(new Error("Access denied"));

    render(<CwdPicker value="C:/work" onChange={() => {}} />);

    expect((await screen.findByRole("alert")).textContent).toContain("Access denied");
    expect(
      (screen.getByRole("button", { name: "Use this folder" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
