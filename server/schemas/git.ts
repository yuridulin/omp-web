import { z } from "zod";

/** Shapes shared by the git status/mutation routes. */

export const gitFileStatusSchema = z.looseObject({
  filePath: z.string(),
  status: z.string(),
  code: z.string(),
  indexStatus: z.string(),
  worktreeStatus: z.string(),
  collapseReason: z.string().optional(),
});

export const gitStatusSchema = z.looseObject({
  isGitRepository: z.boolean(),
  repositoryRoot: z.string().nullable(),
  files: z.array(gitFileStatusSchema),
});

export const gitBranchSchema = z.looseObject({
  name: z.string(),
  head: z.string(),
  current: z.boolean(),
});
