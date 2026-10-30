import { useQuery } from "@tanstack/react-query";
import {
  fetchFileContent,
  fetchFileList,
  fetchGitFileContents,
  fetchSessionContext,
} from "@/api/workspace";
import type { DiffTabSource } from "@/layout/layout-store";

export function useFileList(path: string | null, sessionId: string | null) {
  return useQuery({
    queryKey: ["file-list", path, sessionId],
    queryFn: () => fetchFileList(path as string, sessionId ?? undefined),
    enabled: Boolean(path),
    staleTime: 3_000,
  });
}

export function useFileContent(path: string | null, sessionId: string | null) {
  return useQuery({
    queryKey: ["file-content", path, sessionId],
    queryFn: () => fetchFileContent(path as string, sessionId ?? undefined),
    enabled: Boolean(path),
    staleTime: 3_000,
  });
}

export function useGitFile(source: DiffTabSource | null) {
  return useQuery({
    queryKey: ["git-file", source],
    queryFn: () => {
      if (!source) throw new Error("Missing diff source");
      return fetchGitFileContents(source.cwd, source.path, {
        ...(source.from ? { from: source.from } : {}),
        ...(source.to ? { to: source.to } : {}),
        ...(source.oldPath ? { oldPath: source.oldPath } : {}),
      });
    },
    enabled: Boolean(source),
    staleTime: 3_000,
  });
}

export function useSessionContext(sessionId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["session-context", sessionId],
    queryFn: () => fetchSessionContext(sessionId as string),
    enabled: Boolean(sessionId) && enabled,
    staleTime: 5_000,
  });
}
