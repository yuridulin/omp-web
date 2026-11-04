import { beforeEach, describe, expect, it, vi } from "vitest";
import { pickNativeFolder } from "./workspace";

const apiMock = vi.hoisted(() => ({
  GET: vi.fn(),
  POST: vi.fn(),
}));

vi.mock("./client", () => ({ api: apiMock }));

function ok(data: unknown, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) };
}

function fail(error: unknown, status: number) {
  return { data: undefined, error, response: new Response(null, { status }) };
}

beforeEach(() => {
  apiMock.GET.mockReset();
  apiMock.POST.mockReset();
});

describe("pickNativeFolder", () => {
  it("returns the directory the host dialog reported", async () => {
    apiMock.POST.mockResolvedValueOnce(ok({ path: "D:\\Work\\omp-web" }));

    await expect(pickNativeFolder("D:\\Work")).resolves.toEqual({
      kind: "picked",
      path: "D:\\Work\\omp-web",
    });
    expect(apiMock.POST).toHaveBeenCalledWith("/api/workspace/cwd/pick", { body: { cwd: "D:\\Work" } });
  });

  it("reports a dismissed dialog as cancelled", async () => {
    apiMock.POST.mockResolvedValueOnce(ok({ path: null }));

    await expect(pickNativeFolder()).resolves.toEqual({ kind: "cancelled" });
    expect(apiMock.POST).toHaveBeenCalledWith("/api/workspace/cwd/pick", { body: {} });
  });

  it("turns a host without a dialog into an unavailable answer the caller can fall back from", async () => {
    apiMock.POST.mockResolvedValueOnce(
      fail({ error: "No native folder dialog on this host", code: "dialog_unavailable" }, 503),
    );

    await expect(pickNativeFolder()).resolves.toEqual({
      kind: "unavailable",
      reason: "No native folder dialog on this host",
    });
  });

  it("throws on an unexpected failure instead of pretending the host has no dialog", async () => {
    apiMock.POST.mockResolvedValueOnce(fail({ error: "Directory is not readable", code: "internal" }, 500));

    await expect(pickNativeFolder()).rejects.toThrow("Directory is not readable");
  });
});
