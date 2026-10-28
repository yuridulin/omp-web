/**
 * Editing and forking are mutually exclusive history mutations.
 *
 * The rule is not cosmetic: while an edit is in flight the runtime is rewriting
 * the session file, and a fork started against that file would read a torn
 * transcript. Keeping the gate in the domain means every front end enforces it.
 */

export interface BranchingState {
  /** Entry whose prompt is being edited in place, if any. */
  editingEntryId: string | null;
  /** Entry a fork was requested for, if any. */
  forkingEntryId: string | null;
  /** Selected leaf in the session tree; null means the runtime's own leaf. */
  leafId: string | null;
}

export type BranchingAction =
  | { type: "edit-begin"; entryId: string }
  | { type: "edit-settled" }
  | { type: "fork-begin"; entryId: string }
  | { type: "fork-settled" }
  | { type: "leaf-select"; leafId: string | null }
  | { type: "reset" };

export const initialBranching: BranchingState = {
  editingEntryId: null,
  forkingEntryId: null,
  leafId: null,
};

export function branchReducer(state: BranchingState, action: BranchingAction): BranchingState {
  switch (action.type) {
    case "edit-begin":
      if (isHistoryBusy(state)) return state;
      return { ...state, editingEntryId: action.entryId };
    case "edit-settled":
      return { ...state, editingEntryId: null };
    case "fork-begin":
      if (isHistoryBusy(state)) return state;
      return { ...state, forkingEntryId: action.entryId };
    case "fork-settled":
      return { ...state, forkingEntryId: null };
    case "leaf-select":
      return { ...state, leafId: action.leafId };
    case "reset":
      return initialBranching;
    default:
      return state;
  }
}

/** True while a history mutation owns the session; both actions are refused. */
export function isHistoryBusy(state: BranchingState): boolean {
  return state.editingEntryId !== null || state.forkingEntryId !== null;
}

export function canBeginEdit(state: BranchingState, entryId: string): boolean {
  return !isHistoryBusy(state) || state.editingEntryId === entryId;
}

export function canBeginFork(state: BranchingState, entryId: string): boolean {
  return !isHistoryBusy(state) || state.forkingEntryId === entryId;
}
