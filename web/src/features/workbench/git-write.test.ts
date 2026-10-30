import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("@/api/client", () => ({
  api: {
    GET: mocks.get,
    POST: mocks.post,
  },
}));

vi.mock("./use-git-write", () => ({
  useGitBranches: () => ({
    data: {
      current: "main",
      branches: [
        { name: "main", head: "aaa111", current: true },
        { name: "dev", head: "bbb222", current: false },
      ],
    },
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

import type { GitStatus } from "@/api/workspace";
import { checkoutGit, commitGit, fetchGitBranches, stageGit, unstageGit } from "@/api/git-write";
import { GitActions, type GitActionsProps } from "./GitActions";

function ok(data: unknown) {
  return { data, error: undefined, response: { status: 200 } };
}

function fail(status: number, message: string) {
  return { data: undefined, error: { error: message, code: "GIT_FAILED" }, response: { status } };
}

const emptyStatus: GitStatus = {
  isGitRepository: true,
  repositoryRoot: "D:/repo",
  files: [],
};

const dirtyStatus: GitStatus = {
  isGitRepository: true,
  repositoryRoot: "D:/repo",
  files: [
    {
      filePath: "D:/repo/a.ts",
      status: "modified",
      code: "M",
      indexStatus: "M",
      worktreeStatus: "M",
    },
  ],
};

describe("git write api", () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
  });

  it("lists branches and drops malformed entries", async () => {
    mocks.get.mockResolvedValue(
      ok({
        current: "main",
        branches: [
          { name: "main", head: "aaa111", current: true },
          { name: 7, current: false },
        ],
      }),
    );

    const result = await fetchGitBranches("D:/repo");

    expect(mocks.get).toHaveBeenCalledWith("/api/workspace/git/branches", {
      params: { query: { cwd: "D:/repo" } },
    });
    expect(result).toEqual({
      current: "main",
      branches: [{ name: "main", head: "aaa111", current: true }],
    });
  });

  it("posts stage and unstage bodies with explicit paths or all", async () => {
    mocks.post.mockResolvedValue(ok(emptyStatus));

    await stageGit("D:/repo", { paths: ["a.ts", "b.ts"] });
    expect(mocks.post).toHaveBeenLastCalledWith("/api/workspace/git/stage", {
      body: { cwd: "D:/repo", paths: ["a.ts", "b.ts"] },
    });

    await unstageGit("D:/repo", { all: true });
    expect(mocks.post).toHaveBeenLastCalledWith("/api/workspace/git/unstage", {
      body: { cwd: "D:/repo", all: true },
    });
  });

  it("commits and returns the new commit id with fresh status", async () => {
    mocks.post.mockResolvedValue(ok({ commit: "abc123", status: emptyStatus }));

    const result = await commitGit("D:/repo", { message: "fix tests", amend: false });

    expect(mocks.post).toHaveBeenCalledWith("/api/workspace/git/commit", {
      body: { cwd: "D:/repo", message: "fix tests", amend: false },
    });
    expect(result).toEqual({ commit: "abc123", status: emptyStatus });
  });

  it("checks out and optionally creates a branch", async () => {
    mocks.post.mockResolvedValue(ok({ branch: "feature/login" }));

    expect(await checkoutGit("D:/repo", { branch: "feature/login", create: true })).toEqual({
      branch: "feature/login",
    });
    expect(mocks.post).toHaveBeenCalledWith("/api/workspace/git/checkout", {
      body: { cwd: "D:/repo", branch: "feature/login", create: true },
    });
  });

  it("surfaces the server error message and status", async () => {
    mocks.post.mockResolvedValue(fail(409, "working tree is dirty"));
    await expect(stageGit("D:/repo", { all: true })).rejects.toThrow("working tree is dirty");

    mocks.get.mockResolvedValue(fail(403, "not allowed"));
    await expect(fetchGitBranches("D:/repo")).rejects.toThrow("not allowed");
  });
});

function makeProps(overrides: Partial<GitActionsProps> = {}): GitActionsProps {
  return {
    root: "D:/repo",
    status: emptyStatus,
    pending: false,
    error: null,
    onStageAll: vi.fn(),
    onUnstageAll: vi.fn(),
    onCommit: vi.fn(async () => {}),
    onCheckout: vi.fn(async () => {}),
    onCreateBranch: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("GitActions", () => {
  afterEach(cleanup);

  it("shows the current branch and checks out the selected one", async () => {
    const props = makeProps();
    render(createElement(GitActions, props));

    const select = screen.getByLabelText("Branch") as HTMLSelectElement;
    expect(select.value).toBe("main");

    fireEvent.change(select, { target: { value: "dev" } });
    await waitFor(() => expect(props.onCheckout).toHaveBeenCalledWith("dev"));
  });

  it("commits with Ctrl+Enter and keeps amend state", async () => {
    const props = makeProps();
    render(createElement(GitActions, props));

    const textarea = screen.getByLabelText("Commit message") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "  fix tests  " } });
    fireEvent.click(screen.getByLabelText("Amend"));
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    await waitFor(() => expect(props.onCommit).toHaveBeenCalledWith("fix tests", true));
    await waitFor(() => expect(textarea.value).toBe(""));
  });

  it("creates a branch from the inline input", async () => {
    const props = makeProps();
    render(createElement(GitActions, props));

    fireEvent.click(screen.getByRole("button", { name: "New branch" }));
    const input = screen.getByLabelText("New branch name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "feature/login" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(props.onCreateBranch).toHaveBeenCalledWith("feature/login"));
  });

  it("disables controls while a git write is pending", () => {
    const props = makeProps({ pending: true, status: dirtyStatus });
    render(createElement(GitActions, props));

    expect((screen.getByLabelText("Branch") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText("Commit message") as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Commit" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Stage all" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Unstage all" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
