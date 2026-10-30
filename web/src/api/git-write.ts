import { api } from "./client";
import { isRecord } from "./guards";
import type { paths } from "./schema";
import type { GitStatus } from "./workspace";

export interface GitBranch {
  name: string;
  head: string;
  current: boolean;
}

type GitStageBody = NonNullable<
  paths["/api/workspace/git/stage"]["post"]["requestBody"]
>["content"]["application/json"];
type GitUnstageBody = NonNullable<
  paths["/api/workspace/git/unstage"]["post"]["requestBody"]
>["content"]["application/json"];
type GitCommitBody = NonNullable<
  paths["/api/workspace/git/commit"]["post"]["requestBody"]
>["content"]["application/json"];
type GitCheckoutBody = NonNullable<
  paths["/api/workspace/git/checkout"]["post"]["requestBody"]
>["content"]["application/json"];

function errorMessage(value: unknown, status: number): string {
  if (isRecord(value) && typeof value.error === "string" && value.error) return value.error;
  return `HTTP ${status}`;
}

function parseBranch(value: unknown): GitBranch | null {
  if (!isRecord(value) || typeof value.name !== "string") return null;
  return {
    name: value.name,
    head: typeof value.head === "string" ? value.head : "",
    current: value.current === true,
  };
}

function pathOptions(options: { paths?: string[]; all?: boolean }): Pick<GitStageBody, "paths" | "all"> {
  return {
    ...(options.paths ? { paths: options.paths } : {}),
    ...(options.all !== undefined ? { all: options.all } : {}),
  };
}

export async function fetchGitBranches(
  cwd: string,
): Promise<{ current: string | null; branches: GitBranch[] }> {
  const { data, error, response } = await api.GET("/api/workspace/git/branches", {
    params: { query: { cwd } },
  });
  if (error) throw new Error(errorMessage(error, response.status));
  if (!data) throw new Error("Unexpected empty git branches response");
  return {
    current: typeof data.current === "string" ? data.current : null,
    branches: (Array.isArray(data.branches) ? data.branches : [])
      .map(parseBranch)
      .filter((branch): branch is GitBranch => branch !== null),
  };
}

export async function stageGit(
  cwd: string,
  options: { paths?: string[]; all?: boolean },
): Promise<GitStatus> {
  const body: GitStageBody = { cwd, ...pathOptions(options) };
  const { data, error, response } = await api.POST("/api/workspace/git/stage", { body });
  if (error) throw new Error(errorMessage(error, response.status));
  if (!data) throw new Error("Unexpected empty git stage response");
  return data;
}

export async function unstageGit(
  cwd: string,
  options: { paths?: string[]; all?: boolean },
): Promise<GitStatus> {
  const body: GitUnstageBody = { cwd, ...pathOptions(options) };
  const { data, error, response } = await api.POST("/api/workspace/git/unstage", { body });
  if (error) throw new Error(errorMessage(error, response.status));
  if (!data) throw new Error("Unexpected empty git unstage response");
  return data;
}

export async function commitGit(
  cwd: string,
  options: { message: string; amend?: boolean; paths?: string[] },
): Promise<{ commit: string; status: GitStatus }> {
  const body: GitCommitBody = {
    cwd,
    message: options.message,
    ...(options.amend !== undefined ? { amend: options.amend } : {}),
    ...(options.paths ? { paths: options.paths } : {}),
  };
  const { data, error, response } = await api.POST("/api/workspace/git/commit", { body });
  if (error) throw new Error(errorMessage(error, response.status));
  if (!data) throw new Error("Unexpected empty git commit response");
  return { commit: data.commit, status: data.status };
}

export async function checkoutGit(
  cwd: string,
  options: { branch: string; create?: boolean },
): Promise<{ branch: string }> {
  const body: GitCheckoutBody = {
    cwd,
    branch: options.branch,
    ...(options.create !== undefined ? { create: options.create } : {}),
  };
  const { data, error, response } = await api.POST("/api/workspace/git/checkout", { body });
  if (error) throw new Error(errorMessage(error, response.status));
  if (!data) throw new Error("Unexpected empty git checkout response");
  return { branch: data.branch };
}
