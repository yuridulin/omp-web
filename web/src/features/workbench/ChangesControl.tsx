import { relativePath } from "@/api/paths";
import type { ChangesSlotData } from "@/slots/changes";
import { skinFor } from "@/skins/registry";
import { useAppearance } from "@/state/use-appearance";
import { useGitBranches, useGitWrite } from "./use-git-write";

/**
 * Binding layer between the files skin and a changes skin. It owns git
 * queries/mutations per root so the skin only renders data and callbacks.
 */
export function ChangesControl({
  root,
  ...data
}: ChangesSlotData) {
  const appearance = useAppearance();
  const ChangesSkin = skinFor("changes", appearance);
  const git = useGitWrite(root);
  const branches = useGitBranches(root);

  // The git routes validate repo-relative POSIX paths; status rows carry
  // absolute paths, so strip the workspace root before calling them.
  const toRepoPaths = (paths: string[]) => paths.map((path) => relativePath(path, root));

  return (
    <ChangesSkin
      root={root}
      {...data}
      pending={git.pending}
      writeError={git.error}
      branches={branches.data?.branches ?? []}
      currentBranch={branches.data?.current ?? null}
      branchesLoading={branches.isLoading}
      branchesError={branches.isError ? branches.error.message : null}
      onStage={(paths) => {
        void git.stage(toRepoPaths(paths)).catch(() => {});
      }}
      onUnstage={(paths) => {
        void git.unstage(toRepoPaths(paths)).catch(() => {});
      }}
      onStageAll={() => {
        void git.stageAll().catch(() => {});
      }}
      onUnstageAll={() => {
        void git.unstageAll().catch(() => {});
      }}
      onCommit={async (message, amend) => {
        await git.commit(message, amend);
      }}
      onCheckout={async (branch) => {
        await git.checkout(branch);
      }}
      onCreateBranch={async (name) => {
        await git.createBranch(name);
      }}
    />
  );
}
