import { useCallback, useState } from "react";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  checkoutGit,
  commitGit,
  fetchGitBranches,
  stageGit,
  unstageGit,
  type GitBranch,
} from "@/api/git-write";

export function useGitBranches(
  cwd: string | null,
): UseQueryResult<{ current: string | null; branches: GitBranch[] }> {
  return useQuery({
    queryKey: ["git-branches", cwd],
    queryFn: () => fetchGitBranches(cwd as string),
    enabled: Boolean(cwd),
    staleTime: 5_000,
  });
}

export function useGitWrite(cwd: string | null) {
  const queryClient = useQueryClient();
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["git-status", cwd] });
    void queryClient.invalidateQueries({ queryKey: ["git-file"] });
    void queryClient.invalidateQueries({ queryKey: ["file-list"] });
  }, [cwd, queryClient]);

  const invalidateBranches = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["git-branches"] });
  }, [queryClient]);

  const run = useCallback(async <T,>(operation: () => Promise<T>): Promise<T> => {
    setPendingCount((count) => count + 1);
    setError(null);
    try {
      return await operation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    } finally {
      setPendingCount((count) => count - 1);
    }
  }, []);

  const stage = useCallback(
    async (paths: string[]): Promise<void> => {
      if (!cwd) return;
      await run(() => stageGit(cwd, { paths }));
      invalidate();
    },
    [cwd, invalidate, run],
  );

  const stageAll = useCallback(async (): Promise<void> => {
    if (!cwd) return;
    await run(() => stageGit(cwd, { all: true }));
    invalidate();
  }, [cwd, invalidate, run]);

  const unstage = useCallback(
    async (paths: string[]): Promise<void> => {
      if (!cwd) return;
      await run(() => unstageGit(cwd, { paths }));
      invalidate();
    },
    [cwd, invalidate, run],
  );

  const unstageAll = useCallback(async (): Promise<void> => {
    if (!cwd) return;
    await run(() => unstageGit(cwd, { all: true }));
    invalidate();
  }, [cwd, invalidate, run]);

  const commit = useCallback(
    async (message: string, amend: boolean): Promise<string> => {
      if (!cwd) throw new Error("No workspace selected");
      const result = await run(() => commitGit(cwd, { message, amend }));
      invalidate();
      invalidateBranches();
      return result.commit;
    },
    [cwd, invalidate, invalidateBranches, run],
  );

  const checkout = useCallback(
    async (branch: string): Promise<void> => {
      if (!cwd) return;
      await run(() => checkoutGit(cwd, { branch }));
      invalidate();
      invalidateBranches();
    },
    [cwd, invalidate, invalidateBranches, run],
  );

  const createBranch = useCallback(
    async (name: string): Promise<void> => {
      if (!cwd) return;
      await run(() => checkoutGit(cwd, { branch: name, create: true }));
      invalidate();
      invalidateBranches();
    },
    [cwd, invalidate, invalidateBranches, run],
  );

  return {
    stage,
    stageAll,
    unstage,
    unstageAll,
    commit,
    checkout,
    createBranch,
    pending: pendingCount > 0,
    error,
  };
}
