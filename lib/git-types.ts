export type GitFileStatusKind =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflict";

/** Why `.gitattributes` moves a changed file out of the main review list. */
export type GitCollapseReason = "generated" | "vendored" | "documentation" | "no-diff";

export interface GitFileStatus {
  filePath: string;
  originalPath?: string;
  status: GitFileStatusKind;
  code: "M" | "A" | "D" | "R" | "U" | "C";
  indexStatus: string;
  worktreeStatus: string;
  collapseReason?: GitCollapseReason;
}

export interface GitStatusResponse {
  isGitRepository: boolean;
  repositoryRoot: string | null;
  files: GitFileStatus[];
}

export interface GitFileDiffResponse {
  supported: boolean;
  status?: GitFileStatusKind;
  patch?: string;
}

export interface GitFileContentsResponse {
  supported: boolean;
  before?: string;
  after?: string;
  language?: string;
  binary?: boolean;
  truncated?: boolean;
  oldPath?: string;
}
