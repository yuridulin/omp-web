import { basename, normalizeSlashes } from "@/api/paths";

export type WorkbenchView = "files" | "changes";

export interface DiffTabSource {
  kind: "working" | "commit";
  cwd: string;
  path: string;
  oldPath?: string;
  from: string;
  to: string;
}

export interface WorkbenchTab {
  id: string;
  kind: "file" | "diff";
  path: string;
  title: string;
  preview?: boolean;
  diff?: DiffTabSource;
  scrollTop?: number;
}

export interface WorkbenchContext {
  root: string | null;
  view: WorkbenchView;
  expanded: string[];
  tabs: WorkbenchTab[];
  activeTabId: string | null;
  treeScrollTop: number;
  changesScrollTop: number;
}

export interface LayoutState {
  railWidth: number;
  workbenchWidth: number;
  navigatorWidth: number;
  railCollapsed: boolean;
  workbenchCollapsed: boolean;
  navigatorCollapsed: boolean;
}

const LAYOUT_KEY = "omp.layout.v1";
const WORKBENCH_PREFIX = "omp.workbench.v1.";

const DEFAULT_LAYOUT: LayoutState = {
  railWidth: 248,
  workbenchWidth: 720,
  navigatorWidth: 220,
  railCollapsed: false,
  workbenchCollapsed: false,
  navigatorCollapsed: false,
};

const MIN_RAIL = 180;
const MAX_RAIL = 420;
const MIN_WORKBENCH = 360;
const MAX_WORKBENCH = 1400;
const MIN_NAVIGATOR = 140;
const MAX_NAVIGATOR = 520;
const MAX_TABS = 30;
const MAX_EXPANDED = 500;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function loadLayout(): LayoutState {
  const raw = storage()?.getItem(LAYOUT_KEY);
  if (!raw) return { ...DEFAULT_LAYOUT };
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_LAYOUT };
    const record = value as Record<string, unknown>;
    return {
      railWidth: clamp(record.railWidth, MIN_RAIL, MAX_RAIL, DEFAULT_LAYOUT.railWidth),
      workbenchWidth: clamp(record.workbenchWidth, MIN_WORKBENCH, MAX_WORKBENCH, DEFAULT_LAYOUT.workbenchWidth),
      navigatorWidth: clamp(record.navigatorWidth, MIN_NAVIGATOR, MAX_NAVIGATOR, DEFAULT_LAYOUT.navigatorWidth),
      railCollapsed: boolean(record.railCollapsed, DEFAULT_LAYOUT.railCollapsed),
      workbenchCollapsed: boolean(record.workbenchCollapsed, DEFAULT_LAYOUT.workbenchCollapsed),
      navigatorCollapsed: boolean(record.navigatorCollapsed, DEFAULT_LAYOUT.navigatorCollapsed),
    };
  } catch {
    return { ...DEFAULT_LAYOUT };
  }
}

let layout = loadLayout();
const layoutListeners = new Set<() => void>();

export function getLayout(): LayoutState {
  return layout;
}

export function subscribeLayout(listener: () => void): () => void {
  layoutListeners.add(listener);
  return () => layoutListeners.delete(listener);
}

export function updateLayout(patch: Partial<LayoutState>): void {
  const next: LayoutState = {
    ...layout,
    ...patch,
  };
  next.railWidth = clamp(next.railWidth, MIN_RAIL, MAX_RAIL, DEFAULT_LAYOUT.railWidth);
  next.workbenchWidth = clamp(next.workbenchWidth, MIN_WORKBENCH, MAX_WORKBENCH, DEFAULT_LAYOUT.workbenchWidth);
  next.navigatorWidth = clamp(next.navigatorWidth, MIN_NAVIGATOR, MAX_NAVIGATOR, DEFAULT_LAYOUT.navigatorWidth);
  if (next.railWidth === layout.railWidth
    && next.workbenchWidth === layout.workbenchWidth
    && next.navigatorWidth === layout.navigatorWidth
    && next.railCollapsed === layout.railCollapsed
    && next.workbenchCollapsed === layout.workbenchCollapsed
    && next.navigatorCollapsed === layout.navigatorCollapsed) return;
  layout = next;
  storage()?.setItem(LAYOUT_KEY, JSON.stringify(layout));
  for (const listener of layoutListeners) listener();
}

const contexts = new Map<string, WorkbenchContext>();
const workbenchListeners = new Set<() => void>();
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

function defaultContext(root: string | null = null): WorkbenchContext {
  return {
    root,
    view: "files",
    expanded: [],
    tabs: [],
    activeTabId: null,
    treeScrollTop: 0,
    changesScrollTop: 0,
  };
}

function isTab(value: unknown): value is WorkbenchTab {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.path !== "string" || typeof record.title !== "string") return false;
  if (record.kind !== "file" && record.kind !== "diff") return false;
  if (record.kind === "diff") {
    const diff = record.diff;
    if (!diff || typeof diff !== "object" || Array.isArray(diff)) return false;
    const source = diff as Record<string, unknown>;
    if (source.kind !== "working" && source.kind !== "commit") return false;
    if (typeof source.cwd !== "string" || typeof source.path !== "string" || typeof source.from !== "string" || typeof source.to !== "string") return false;
  }
  return true;
}

function sanitizeContext(value: unknown, fallbackRoot: string | null): WorkbenchContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaultContext(fallbackRoot);
  const record = value as Record<string, unknown>;
  const tabs = Array.isArray(record.tabs) ? record.tabs.filter(isTab).slice(0, MAX_TABS) : [];
  const activeTabId = typeof record.activeTabId === "string" && tabs.some((tab) => tab.id === record.activeTabId)
    ? record.activeTabId
    : tabs[0]?.id ?? null;
  return {
    root: typeof record.root === "string" ? record.root : fallbackRoot,
    view: record.view === "changes" ? "changes" : "files",
    expanded: Array.isArray(record.expanded)
      ? record.expanded.filter((path): path is string => typeof path === "string").slice(0, MAX_EXPANDED)
      : [],
    tabs,
    activeTabId,
    treeScrollTop: typeof record.treeScrollTop === "number" ? record.treeScrollTop : 0,
    changesScrollTop: typeof record.changesScrollTop === "number" ? record.changesScrollTop : 0,
  };
}

function loadContext(sessionId: string): WorkbenchContext {
  const raw = storage()?.getItem(`${WORKBENCH_PREFIX}${sessionId}`);
  if (!raw) return defaultContext();
  try {
    return sanitizeContext(JSON.parse(raw), null);
  } catch {
    return defaultContext();
  }
}

export function getWorkbenchContext(sessionId: string): WorkbenchContext {
  let context = contexts.get(sessionId);
  if (!context) {
    context = loadContext(sessionId);
    contexts.set(sessionId, context);
  }
  return context;
}

export function subscribeWorkbench(listener: () => void): () => void {
  workbenchListeners.add(listener);
  return () => workbenchListeners.delete(listener);
}

function persist(sessionId: string, context: WorkbenchContext): void {
  storage()?.setItem(`${WORKBENCH_PREFIX}${sessionId}`, JSON.stringify(context));
}

function emitWorkbench(sessionId: string, immediate = true, emit = true): void {
  const context = getWorkbenchContext(sessionId);
  if (immediate) {
    const timer = saveTimers.get(sessionId);
    if (timer) clearTimeout(timer);
    saveTimers.delete(sessionId);
    persist(sessionId, context);
  } else {
    const timer = saveTimers.get(sessionId);
    if (timer) clearTimeout(timer);
    saveTimers.set(sessionId, setTimeout(() => {
      saveTimers.delete(sessionId);
      persist(sessionId, getWorkbenchContext(sessionId));
    }, 250));
  }
  if (emit) for (const listener of workbenchListeners) listener();
}

export function updateWorkbenchContext(
  sessionId: string,
  updater: (context: WorkbenchContext) => WorkbenchContext,
  options: { immediate?: boolean; emit?: boolean } = {},
): void {
  contexts.set(sessionId, updater(getWorkbenchContext(sessionId)));
  emitWorkbench(sessionId, options.immediate ?? true, options.emit ?? true);
}

export function ensureWorkbenchRoot(sessionId: string, root: string | null): void {
  if (!root) return;
  const context = getWorkbenchContext(sessionId);
  if (context.root === root) return;
  updateWorkbenchContext(sessionId, () => defaultContext(root));
}

export function setWorkbenchView(sessionId: string, view: WorkbenchView): void {
  updateWorkbenchContext(sessionId, (context) => (context.view === view ? context : { ...context, view }));
}

export function toggleExpanded(sessionId: string, path: string): void {
  updateWorkbenchContext(sessionId, (context) => {
    const expanded = context.expanded.includes(path)
      ? context.expanded.filter((entry) => entry !== path)
      : [...context.expanded, path].slice(-MAX_EXPANDED);
    return { ...context, expanded };
  });
}

export function setExpanded(sessionId: string, path: string, open: boolean): void {
  updateWorkbenchContext(sessionId, (context) => {
    const has = context.expanded.includes(path);
    if (has === open) return context;
    const expanded = open ? [...context.expanded, path] : context.expanded.filter((entry) => entry !== path);
    return { ...context, expanded };
  });
}

export function setTreeScroll(sessionId: string, treeScrollTop: number): void {
  updateWorkbenchContext(sessionId, (context) => ({ ...context, treeScrollTop }), { immediate: false, emit: false });
}

export function setChangesScroll(sessionId: string, changesScrollTop: number): void {
  updateWorkbenchContext(sessionId, (context) => ({ ...context, changesScrollTop }), { immediate: false, emit: false });
}

export function fileTabId(path: string): string {
  return `file:${normalizeSlashes(path)}`;
}

function shortRev(rev: string): string {
  if (rev === "WORKTREE") return "working";
  if (rev === "INDEX") return "index";
  if (rev === "EMPTY") return "empty";
  if (/^[0-9a-f]{7,}$/i.test(rev)) return rev.slice(0, 7);
  return rev;
}

export function diffTabTitle(source: DiffTabSource): string {
  return `${basename(source.path)} (${shortRev(source.from)} ↔ ${shortRev(source.to)})`;
}

export function diffTabId(source: DiffTabSource): string {
  return `diff:${source.kind}:${normalizeSlashes(source.cwd)}:${source.from}:${source.to}:${normalizeSlashes(source.path)}`;
}

export function openFileTab(sessionId: string, path: string, preview = false): void {
  const id = fileTabId(path);
  updateWorkbenchContext(sessionId, (context) => {
    const existing = context.tabs.find((tab) => tab.id === id);
    if (existing) {
      const tabs = preview
        ? context.tabs
        : context.tabs.map((tab) => (tab.id === id ? { ...tab, preview: false } : tab));
      return { ...context, tabs, activeTabId: id };
    }
    const tab: WorkbenchTab = { id, kind: "file", path, title: basename(path), preview };
    let tabs = context.tabs;
    if (preview) {
      const previewIndex = tabs.findIndex((candidate) => candidate.preview);
      if (previewIndex >= 0) tabs = tabs.map((candidate, index) => (index === previewIndex ? tab : candidate));
      else tabs = [...tabs, tab];
    } else {
      tabs = [...tabs, tab];
    }
    return { ...context, tabs: tabs.slice(-MAX_TABS), activeTabId: id };
  });
}

export function openDiffTab(sessionId: string, source: DiffTabSource): void {
  const id = diffTabId(source);
  updateWorkbenchContext(sessionId, (context) => {
    if (context.tabs.some((tab) => tab.id === id)) return { ...context, activeTabId: id };
    const tab: WorkbenchTab = {
      id,
      kind: "diff",
      path: source.path,
      title: diffTabTitle(source),
      diff: source,
    };
    return { ...context, tabs: [...context.tabs, tab].slice(-MAX_TABS), activeTabId: id };
  });
}

export function setActiveTab(sessionId: string, tabId: string): void {
  updateWorkbenchContext(sessionId, (context) => (
    context.tabs.some((tab) => tab.id === tabId) ? { ...context, activeTabId: tabId } : context
  ));
}

export function closeTab(sessionId: string, tabId: string): void {
  updateWorkbenchContext(sessionId, (context) => {
    const index = context.tabs.findIndex((tab) => tab.id === tabId);
    if (index < 0) return context;
    const tabs = context.tabs.filter((tab) => tab.id !== tabId);
    const activeTabId = context.activeTabId === tabId
      ? tabs[Math.min(index, tabs.length - 1)]?.id ?? null
      : context.activeTabId;
    return { ...context, tabs, activeTabId };
  });
}

export function setTabScroll(sessionId: string, tabId: string, scrollTop: number): void {
  updateWorkbenchContext(sessionId, (context) => ({
    ...context,
    tabs: context.tabs.map((tab) => (tab.id === tabId ? { ...tab, scrollTop } : tab)),
  }), { immediate: false, emit: false });
}

/** Test seam: drop in-memory state and persisted keys. */
export function resetLayoutForTests(): void {
  layout = { ...DEFAULT_LAYOUT };
  contexts.clear();
  layoutListeners.clear();
  workbenchListeners.clear();
  for (const timer of saveTimers.values()) clearTimeout(timer);
  saveTimers.clear();
  const store = storage();
  if (!store) return;
  store.removeItem(LAYOUT_KEY);
  for (let index = store.length - 1; index >= 0; index -= 1) {
    const key = store.key(index);
    if (key?.startsWith(WORKBENCH_PREFIX)) store.removeItem(key);
  }
}
