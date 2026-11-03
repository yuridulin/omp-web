import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { resolve } from "path";
import { getAgentDir } from "./omp/paths";

// ============================================================================
// Session archive marker. Archiving is a UI feature: omp owns the session tree
// and nothing there may change, so omp-web records the flag in its own
// registry (~/.omp/agent/archived-sessions.json, next to projects.json) and the
// JSONL plus its artifacts stay exactly where omp put them. The session remains
// fully readable and resumable; the rail just stops painting its row.
// ============================================================================

export interface SessionArchiveEntry {
  id: string;
  archivedAt: string;
}

export interface SessionArchiveRegistry {
  version: 1;
  sessions: SessionArchiveEntry[];
}

const EMPTY_REGISTRY: SessionArchiveRegistry = { version: 1, sessions: [] };

/** Parse registry JSON; missing, corrupt, or foreign-shaped input yields an
 *  empty registry rather than failing the sidebar. Duplicate ids keep the
 *  first entry so a hand-edited file cannot archive one session twice. */
export function parseSessionArchiveRegistry(raw: string): SessionArchiveRegistry {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return EMPTY_REGISTRY;
    if (!("sessions" in parsed) || !Array.isArray(parsed.sessions)) return EMPTY_REGISTRY;
    const seen = new Set<string>();
    const sessions: SessionArchiveEntry[] = [];
    for (const item of parsed.sessions) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      if (!("id" in item) || typeof item.id !== "string" || !item.id.trim()) continue;
      const id = item.id.trim();
      if (seen.has(id)) continue;
      seen.add(id);
      const archivedAt = "archivedAt" in item && typeof item.archivedAt === "string"
        ? Date.parse(item.archivedAt)
        : Number.NaN;
      sessions.push({
        id,
        archivedAt: Number.isNaN(archivedAt) ? new Date(0).toISOString() : new Date(archivedAt).toISOString(),
      });
    }
    return { version: 1, sessions };
  } catch {
    return EMPTY_REGISTRY;
  }
}

export function loadSessionArchiveRegistry(): SessionArchiveRegistry {
  const file = resolve(getAgentDir(), "archived-sessions.json");
  if (!existsSync(file)) return EMPTY_REGISTRY;
  try {
    return parseSessionArchiveRegistry(readFileSync(file, "utf8"));
  } catch {
    return EMPTY_REGISTRY;
  }
}

/** Atomic persistence: write a temp file in the same directory, then rename
 *  over the registry. A crash mid-write leaves the previous registry intact. */
export function saveSessionArchiveRegistry(registry: SessionArchiveRegistry): void {
  const file = resolve(getAgentDir(), "archived-sessions.json");
  mkdirSync(resolve(file, ".."), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(temp, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
    renameSync(temp, file);
  } finally {
    // Best-effort cleanup if the rename never happened (e.g. EACCES).
    try {
      if (existsSync(temp)) rmSync(temp);
    } catch {
      // ignore cleanup failures
    }
  }
}

/** Archive the given session ids. Idempotent: an already-archived id keeps its
 *  original timestamp, and an unchanged registry is returned by identity so a
 *  caller can skip the write. */
export function archiveSessions(
  registry: SessionArchiveRegistry,
  ids: readonly string[],
  now = new Date().toISOString(),
): SessionArchiveRegistry {
  const known = new Set(registry.sessions.map((entry) => entry.id));
  const added = ids
    .filter((id) => id && !known.has(id))
    .map((id) => ({ id, archivedAt: now }));
  if (added.length === 0) return registry;
  return { version: 1, sessions: [...registry.sessions, ...added] };
}

/** Restore one session. Returns the same registry when the id was not archived. */
export function restoreSession(
  registry: SessionArchiveRegistry,
  id: string,
): SessionArchiveRegistry {
  const sessions = registry.sessions.filter((entry) => entry.id !== id);
  if (sessions.length === registry.sessions.length) return registry;
  return { version: 1, sessions };
}
