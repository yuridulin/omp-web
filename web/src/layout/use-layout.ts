import { useCallback, useSyncExternalStore } from "react";
import {
  getLayout,
  getWorkbenchContext,
  subscribeLayout,
  subscribeWorkbench,
  type LayoutState,
  type WorkbenchContext,
} from "./layout-store";

export function useLayout(): LayoutState {
  return useSyncExternalStore(subscribeLayout, getLayout, getLayout);
}

const EMPTY_CONTEXT: WorkbenchContext = {
  root: null,
  view: "files",
  expanded: [],
  tabs: [],
  activeTabId: null,
  treeScrollTop: 0,
  changesScrollTop: 0,
};

export function useWorkbench(sessionId: string | null): WorkbenchContext {
  const subscribe = useCallback((listener: () => void) => subscribeWorkbench(listener), []);
  const getSnapshot = useCallback(
    () => (sessionId ? getWorkbenchContext(sessionId) : EMPTY_CONTEXT),
    [sessionId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_CONTEXT);
}
