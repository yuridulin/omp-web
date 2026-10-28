import { isRecord } from "./guards";

/**
 * Todo snapshots: parsing, branch resolution and status-line summaries.
 *
 * A snapshot reaches the UI two ways — a `user_todo_edit` custom entry written
 * when the user edits the list, or the `todo` tool result — and only the newest
 * one on the selected branch is current. Both shapes are untrusted input, so
 * parsing is all-or-nothing: a single bad task invalidates the snapshot rather
 * than rendering a list with holes.
 */

export type TodoStatus = "pending" | "in_progress" | "completed" | "blocked" | "abandoned";

export interface TodoItem {
  content: string;
  status: TodoStatus;
  blocker?: string;
}

export interface TodoPhase {
  name: string;
  tasks: readonly TodoItem[];
}

/** Minimal entry shape the walk needs; the full session-entry type is not core's concern. */
export interface TodoSourceEntry {
  id: string;
  parentId?: string | null;
  type: string;
  customType?: string;
  data?: unknown;
  message?: unknown;
}

const TODO_STATUSES: Record<TodoStatus, true> = {
  pending: true,
  in_progress: true,
  completed: true,
  blocked: true,
  abandoned: true,
};

/**
 * Parse an untrusted todo payload. Anything short of a fully well-formed phase
 * list yields `null` — callers fall back to an older snapshot or to no list.
 */
export function parseTodoPhases(raw: unknown): TodoPhase[] | null {
  if (!Array.isArray(raw)) return null;
  const phases: TodoPhase[] = [];
  for (const phase of raw) {
    if (!isRecord(phase) || typeof phase.name !== "string" || !Array.isArray(phase.tasks)) {
      return null;
    }
    const tasks: TodoItem[] = [];
    for (const task of phase.tasks) {
      if (!isRecord(task) || typeof task.content !== "string") return null;
      const status =
        typeof task.status === "string" && Object.hasOwn(TODO_STATUSES, task.status)
          ? (task.status as TodoStatus)
          : null;
      if (status === null) return null;
      if (task.blocker !== undefined && typeof task.blocker !== "string") return null;
      tasks.push(
        typeof task.blocker === "string"
          ? { content: task.content, status, blocker: task.blocker }
          : { content: task.content, status },
      );
    }
    phases.push({ name: phase.name, tasks });
  }
  return phases;
}

/** The snapshot an entry carries, or `null` when it is not a valid one. */
function entrySnapshot(entry: TodoSourceEntry): TodoPhase[] | null {
  if (entry.type === "custom") {
    if (entry.customType !== "user_todo_edit" || !isRecord(entry.data)) return null;
    return parseTodoPhases(entry.data.phases);
  }
  if (entry.type !== "message" || !isRecord(entry.message)) return null;
  const message = entry.message;
  if (message.role !== "toolResult" || message.toolName !== "todo" || message.isError) return null;
  return isRecord(message.details) ? parseTodoPhases(message.details.phases) : null;
}

/**
 * Newest valid todo snapshot on the branch ending at `leafId`.
 *
 * The walk is leaf→root with a seen-set guard, because a resumed session file
 * can carry a corrupted `parentId` chain. `leafId === null` means "no branch
 * selected"; `undefined` means "the tip the entries were read for".
 */
export function todoPhasesFromEntries(
  entries: readonly TodoSourceEntry[],
  leafId?: string | null,
): readonly TodoPhase[] {
  if (leafId === null || entries.length === 0) return [];
  const byId = new Map<string, TodoSourceEntry>(entries.map((entry) => [entry.id, entry]));
  let entry: TodoSourceEntry | undefined =
    leafId === undefined ? entries[entries.length - 1] : byId.get(leafId);
  const path: TodoSourceEntry[] = [];
  const seen = new Set<string>();
  while (entry !== undefined && !seen.has(entry.id)) {
    seen.add(entry.id);
    path.push(entry);
    entry = entry.parentId ? byId.get(entry.parentId) : undefined;
  }

  for (const current of path) {
    const phases = entrySnapshot(current);
    if (phases !== null) return phases;
  }
  return [];
}

export interface CurrentTodoPhase {
  name: string;
  index: number; // 1-based
  phaseCount: number;
  done: number; // completed tasks in this phase
  total: number;
}

/**
 * The phase that still needs attention, or `null` once the list is finished.
 *
 * Pending or in-progress work wins, because that is what the agent is doing.
 * A list whose only unfinished work is blocked or abandoned still points at the
 * first such phase instead of reporting nothing, so the blocker stays visible.
 */
export function currentTodoPhase(phases: readonly TodoPhase[]): CurrentTodoPhase | null {
  for (let index = 0; index < phases.length; index += 1) {
    const { name, tasks } = phases[index];
    // Matches the reference: only pending/in-progress work is "current"; a
    // phase whose remaining tasks are all blocked or abandoned is not.
    if (!tasks.some((task) => task.status === "pending" || task.status === "in_progress")) continue;
    return {
      name,
      index: index + 1,
      phaseCount: phases.length,
      done: tasks.filter((task) => task.status === "completed").length,
      total: tasks.length,
    };
  }
  return null;
}

/** Completed tasks across every phase, as counts and a clamped one-decimal percentage. */
export function todoProgress(
  phases: readonly TodoPhase[],
): { done: number; total: number; percent: number | null } {
  let done = 0;
  let total = 0;
  for (const phase of phases) {
    total += phase.tasks.length;
    for (const task of phase.tasks) {
      if (task.status === "completed") done += 1;
    }
  }
  if (total === 0) return { done, total, percent: null };
  const clamped = Math.min(100, Math.max(0, (done / total) * 100));
  return { done, total, percent: Math.round(clamped * 10) / 10 };
}
