/**
 * Session catalog: the projects the sidebar shows, the sessions under them, and
 * the pure ordering/grouping/search helpers a host needs to render both.
 *
 * Everything here is plain data and deterministic: no storage, no clock, no
 * input mutation. Project paths carry the user-visible form; every comparison
 * goes through `comparablePath` so casing- and separator-only differences
 * (the Windows/NTFS reality) never split or duplicate a row.
 */

/** A workspace row: either registered in the project registry or discovered
 *  from a session's project root. */
export interface ProjectSummary {
  path: string;
  /** ISO timestamp of the last explicit add. */
  addedAt?: string;
  /** Explicit sidebar position for registered projects. */
  sortOrder?: number;
  /** Set when pinned: position among pinned projects (lower first). */
  pinOrder?: number;
  /** Hidden registry entries are excluded from the merged catalog. */
  hidden?: boolean;
}

/** The slice of session metadata the catalog needs. */
export interface SessionSummary {
  id: string;
  cwd: string;
  projectRoot?: string;
  projectKey?: string;
  name?: string;
  created?: string;
  modified?: string;
  lastMessageAt?: string;
  messageCount?: number;
  archived?: boolean;
}

/**
 * Comparable form of a project/session path: separators folded to `/`, runs
 * collapsed, trailing slash stripped, case folded. Empty stays empty.
 *
 * Pure string normalization so it works identically in every host.
 */
export function comparablePath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/, "")
    .toLowerCase();
}

/**
 * Merge registered projects with session-discovered paths.
 *
 * Registered entries keep their presentation fields and come first (the
 * manual ordering); hidden entries are dropped and also suppress re-discovery,
 * so hiding a project keeps its sessions off the sidebar until it is added
 * again. A discovered path that folds onto an already-present path is skipped.
 * Discovered paths are appended as `{ path }`, so they sort below registered
 * projects that carry an add timestamp (see `sortProjects`).
 */
export function mergeProjects(
  registered: readonly ProjectSummary[],
  discovered: Iterable<string>,
): readonly ProjectSummary[] {
  const merged: ProjectSummary[] = [];
  const seen = new Set<string>();
  const hidden = new Set(
    registered.filter((project) => project.hidden).map((project) => comparablePath(project.path)),
  );
  for (const project of registered) {
    if (project.hidden) continue;
    const key = comparablePath(project.path);
    if (seen.has(key)) continue; // tolerate hand-edited duplicates
    seen.add(key);
    const entry: ProjectSummary = { path: project.path };
    if (project.addedAt !== undefined) entry.addedAt = project.addedAt;
    if (project.sortOrder !== undefined) entry.sortOrder = project.sortOrder;
    if (project.pinOrder !== undefined) entry.pinOrder = project.pinOrder;
    merged.push(entry);
  }
  for (const path of discovered) {
    const key = comparablePath(path);
    if (key === "" || hidden.has(key) || seen.has(key)) continue;
    seen.add(key);
    merged.push({ path });
  }
  return sortProjects(merged);
}

/**
 * The manual/"none" project order: explicit `sortOrder` first (ascending),
 * then most-recently-added (`addedAt` desc), then path for a deterministic
 * order. Projects without `addedAt` (session-discovered) sort below registered
 * entries that have one. Session activity is deliberately ignored here so
 * project rows do not jump around while sessions refresh.
 */
export function sortProjects(projects: readonly ProjectSummary[]): readonly ProjectSummary[] {
  return [...projects].sort((a, b) => {
    const aManual = a.sortOrder !== undefined;
    const bManual = b.sortOrder !== undefined;
    if (aManual !== bManual) return aManual ? -1 : 1;
    if (aManual && bManual && a.sortOrder !== b.sortOrder) return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    const aHas = a.addedAt !== undefined;
    const bHas = b.addedAt !== undefined;
    if (aHas !== bHas) return aHas ? -1 : 1;
    if (aHas && bHas) {
      const byAdded = (b.addedAt ?? "").localeCompare(a.addedAt ?? "");
      if (byAdded !== 0) return byAdded;
    }
    return a.path.localeCompare(b.path);
  });
}

/** Sidebar workspace sort: `none` is the manual/registration order above. */
export type ProjectSort = "none" | "alphabetical" | "updated";

/** Newest `lastMessageAt`/`modified` per folded project path. Sessions without
 *  a usable timestamp contribute nothing, so their project sorts last. */
function projectActivity(sessions: readonly SessionSummary[]): Map<string, number> {
  const activity = new Map<string, number>();
  for (const session of sessions) {
    const raw = session.lastMessageAt ?? session.modified;
    const time = raw === undefined ? undefined : Date.parse(raw);
    if (time === undefined || Number.isNaN(time)) continue;
    const key = comparablePath(session.projectKey ?? session.projectRoot ?? session.cwd);
    if (time > (activity.get(key) ?? Number.NEGATIVE_INFINITY)) activity.set(key, time);
  }
  return activity;
}

/**
 * Order projects for a sort mode. In `none`, pins are ignored and the manual
 * order applies. Otherwise pinned projects come first in their `pinOrder`,
 * then the rest by label (A→Z, case-insensitive, digits numerically) or by
 * their newest session activity (`lastMessageAt`, else `modified`; most recent
 * first, projects without activity last). Ties keep the manual order.
 */
export function orderProjects(
  projects: readonly ProjectSummary[],
  mode: ProjectSort,
  sessions: readonly SessionSummary[],
  labelOf: (project: ProjectSummary) => string,
): readonly ProjectSummary[] {
  const manual = sortProjects(projects);
  if (mode === "none") return manual;
  const pinned = manual
    .filter((project) => project.pinOrder !== undefined)
    .sort((a, b) => (a.pinOrder ?? 0) - (b.pinOrder ?? 0));
  const rest = manual.filter((project) => project.pinOrder === undefined);
  if (mode === "alphabetical") {
    rest.sort((a, b) => labelOf(a).localeCompare(labelOf(b), undefined, { sensitivity: "base", numeric: true }));
  } else {
    const activity = projectActivity(sessions);
    rest.sort((a, b) => {
      const aTime = activity.get(comparablePath(a.path));
      const bTime = activity.get(comparablePath(b.path));
      if (aTime === undefined && bTime === undefined) return 0;
      if (aTime === undefined) return 1;
      if (bTime === undefined) return -1;
      return bTime - aTime;
    });
  }
  return [...pinned, ...rest];
}

/**
 * Group sessions under their project. Every project gets a bucket keyed by its
 * exact `path` (possibly empty) so empty managed projects still render their
 * empty state. Sessions match through a folded lookup of
 * `projectKey ?? projectRoot ?? cwd`, which keeps casing-only differences and
 * linked worktrees (collapsed to `projectRoot`) in the right bucket.
 * Unmatched sessions are dropped.
 */
export function groupSessions(
  projects: readonly ProjectSummary[],
  sessions: readonly SessionSummary[],
): ReadonlyMap<string, readonly SessionSummary[]> {
  const grouped = new Map<string, readonly SessionSummary[]>();
  const bucketByKey = new Map<string, SessionSummary[]>();
  for (const project of projects) {
    const bucket: SessionSummary[] = [];
    grouped.set(project.path, bucket);
    bucketByKey.set(comparablePath(project.path), bucket);
  }
  for (const session of sessions) {
    const bucket = bucketByKey.get(comparablePath(session.projectKey ?? session.projectRoot ?? session.cwd));
    if (bucket) bucket.push(session);
  }
  return grouped;
}

/**
 * Case-insensitive substring search over a session's name, cwd and project
 * root. A blank query returns every session unchanged; results otherwise keep
 * input order.
 */
export function searchSessions(
  sessions: readonly SessionSummary[],
  query: string,
): readonly SessionSummary[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [...sessions];
  return sessions.filter((session) => {
    const fields = [session.name, session.cwd, session.projectRoot];
    return fields.some((field) => field !== undefined && field.toLowerCase().includes(needle));
  });
}

/**
 * Sessions ordered by newest activity (`lastMessageAt`, else `modified`, else
 * `created`), descending. Sessions without any timestamp go last; equal
 * timestamps keep input order. The input is never mutated.
 */
export function newestFirst(sessions: readonly SessionSummary[]): readonly SessionSummary[] {
  return sessions
    .map((session, index) => {
      const raw = session.lastMessageAt ?? session.modified ?? session.created;
      const parsed = raw === undefined ? undefined : Date.parse(raw);
      return { session, index, time: parsed !== undefined && !Number.isNaN(parsed) ? parsed : undefined };
    })
    .sort((a, b) => {
      if (a.time === undefined && b.time === undefined) return a.index - b.index;
      if (a.time === undefined) return 1;
      if (b.time === undefined) return -1;
      if (a.time !== b.time) return b.time - a.time;
      return a.index - b.index;
    })
    .map((entry) => entry.session);
}
