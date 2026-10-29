import { describe, expect, it } from "vitest";
import type { GitFileStatus, GitStatus } from "@/api/workspace";
import { diffSourceFor, groupChanges } from "./ChangesList";

function file(overrides: Partial<GitFileStatus>): GitFileStatus {
  return {
    filePath: "D:/repo/a.ts",
    status: "modified",
    code: "M",
    indexStatus: " ",
    worktreeStatus: "M",
    ...overrides,
  };
}

describe("changes view", () => {
  it("maps working-tree states to the right revision pair", () => {
    expect(diffSourceFor(file({ indexStatus: " ", worktreeStatus: "M" }), "D:/repo")).toMatchObject({
      from: "INDEX",
      to: "WORKTREE",
    });
    expect(diffSourceFor(file({ indexStatus: "M", worktreeStatus: " " }), "D:/repo")).toMatchObject({
      from: "HEAD",
      to: "INDEX",
    });
    expect(diffSourceFor(file({ indexStatus: "M", worktreeStatus: "M" }), "D:/repo")).toMatchObject({
      from: "HEAD",
      to: "WORKTREE",
    });
    expect(diffSourceFor(file({ status: "untracked", code: "U", indexStatus: "?", worktreeStatus: "?" }), "D:/repo")).toMatchObject({
      from: "EMPTY",
      to: "WORKTREE",
    });
    expect(diffSourceFor(file({ status: "deleted", code: "D", indexStatus: " ", worktreeStatus: "D" }), "D:/repo")).toMatchObject({
      from: "INDEX",
      to: "EMPTY",
    });
  });

  it("groups staged, unstaged, untracked and conflicted files", () => {
    const status: GitStatus = {
      isGitRepository: true,
      repositoryRoot: "D:/repo",
      files: [
        file({ filePath: "D:/repo/staged.ts", indexStatus: "M", worktreeStatus: " " }),
        file({ filePath: "D:/repo/unstaged.ts", indexStatus: " ", worktreeStatus: "M" }),
        file({ filePath: "D:/repo/untracked.ts", status: "untracked", code: "U", indexStatus: "?", worktreeStatus: "?" }),
        file({ filePath: "D:/repo/conflict.ts", status: "conflict", code: "C", indexStatus: "U", worktreeStatus: "U" }),
      ],
    };
    const groups = groupChanges(status);
    expect(groups.map((group) => [group.id, group.files.map((entry) => entry.filePath)])).toEqual([
      ["conflicts", ["D:/repo/conflict.ts"]],
      ["staged", ["D:/repo/staged.ts"]],
      ["unstaged", ["D:/repo/unstaged.ts"]],
      ["untracked", ["D:/repo/untracked.ts"]],
    ]);
  });
});
