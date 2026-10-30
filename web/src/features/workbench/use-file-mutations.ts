import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  deleteWorkspacePath,
  renameWorkspacePath,
  uploadWorkspaceFiles,
  writeWorkspaceFile,
  type UploadResult,
} from "@/api/workspace";

type FileAction =
  | { kind: "create"; path: string; content: string }
  | { kind: "rename"; from: string; to: string }
  | { kind: "remove"; path: string; recursive: boolean }
  | { kind: "upload"; directory: string; files: File[] };

const INVALIDATED_KEYS: readonly (readonly string[])[] = [
  ["file-list"],
  ["file-content"],
  ["git-status"],
  ["git-file"],
  ["git-branches"],
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useFileMutations(_sessionId: string | null) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (action: FileAction): Promise<UploadResult | null> => {
      switch (action.kind) {
        case "create":
          await writeWorkspaceFile(action.path, action.content);
          return null;
        case "rename":
          await renameWorkspacePath(action.from, action.to, false);
          return null;
        case "remove":
          await deleteWorkspacePath(action.path, action.recursive);
          return null;
        case "upload":
          return uploadWorkspaceFiles(action.directory, action.files, "error");
      }
    },
  });

  const invalidate = async () => {
    await Promise.all(
      INVALIDATED_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
  };

  const run = async (action: FileAction): Promise<UploadResult | null> => {
    const result = await mutation.mutateAsync(action);
    await invalidate();
    return result;
  };

  return {
    createFile: async (path: string, content = ""): Promise<void> => {
      await run({ kind: "create", path, content });
    },
    rename: async (from: string, to: string): Promise<void> => {
      await run({ kind: "rename", from, to });
    },
    remove: async (path: string, recursive = false): Promise<void> => {
      await run({ kind: "remove", path, recursive });
    },
    upload: async (directory: string, files: File[]): Promise<UploadResult> => {
      const result = await run({ kind: "upload", directory, files });
      return result ?? { uploaded: [], skipped: [], errors: [] };
    },
    pending: mutation.isPending,
    error: mutation.error ? errorMessage(mutation.error) : null,
  };
}
