import { z } from "zod";

/** Shared response shapes for the workspace domain routes. */

export const projectLaunchConfig = z.looseObject({
  profile: z.string().optional(),
  advisor: z.boolean().optional(),
  extraArgs: z.array(z.string()).optional(),
});

export const managedProject = z.looseObject({
  path: z.string(),
  addedAt: z.string().optional(),
  alias: z.string().optional(),
  sortOrder: z.number().optional(),
  pinOrder: z.number().optional(),
  launchConfig: projectLaunchConfig.optional(),
});

export const browsableDirectory = z.looseObject({
  name: z.string(),
  path: z.string(),
});

export const fileIndexEntry = z.looseObject({
  path: z.string(),
  isDir: z.boolean(),
});

export const worktreeInfo = z.looseObject({
  path: z.string(),
  branch: z.string().nullable(),
  isMain: z.boolean(),
});
