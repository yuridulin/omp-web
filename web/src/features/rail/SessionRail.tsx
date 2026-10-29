import { useMemo, useState } from "react";
import { basename, comparablePath } from "@/api/paths";
import type { ProjectSummary, SessionSummary } from "@/api/workspace";
import styles from "./session-rail.module.css";

interface SessionRailProps {
  sessions: SessionSummary[];
  projects: ProjectSummary[];
  selected: string | null;
  running: Set<string>;
  loading: boolean;
  error: string | null;
  onSelect: (sessionId: string) => void;
  onRefresh: () => void;
  onCollapse: () => void;
}

interface ProjectGroup {
  key: string;
  path: string;
  label: string;
  pinOrder: number | null;
  sortOrder: number | null;
  sessions: SessionSummary[];
}

function sessionLabel(session: SessionSummary): string {
  return session.name?.trim() || session.id.slice(0, 8);
}

function sessionTime(session: SessionSummary): string {
  const raw = session.lastMessageAt ?? session.modified;
  const time = new Date(raw).getTime();
  if (!Number.isFinite(time)) return "";
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function byRecency(left: SessionSummary, right: SessionSummary): number {
  const leftTime = new Date(left.lastMessageAt ?? left.modified).getTime();
  const rightTime = new Date(right.lastMessageAt ?? right.modified).getTime();
  return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
}

function projectOrder(left: ProjectGroup, right: ProjectGroup): number {
  const leftPin = left.pinOrder ?? Number.POSITIVE_INFINITY;
  const rightPin = right.pinOrder ?? Number.POSITIVE_INFINITY;
  if (leftPin !== rightPin) return leftPin - rightPin;
  const leftSort = left.sortOrder ?? Number.POSITIVE_INFINITY;
  const rightSort = right.sortOrder ?? Number.POSITIVE_INFINITY;
  if (leftSort !== rightSort) return leftSort - rightSort;
  return left.label.localeCompare(right.label);
}

export function SessionRail({
  sessions,
  projects,
  selected,
  running,
  loading,
  error,
  onSelect,
  onRefresh,
  onCollapse,
}: SessionRailProps) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const map = new Map<string, ProjectGroup>();
    for (const project of projects) {
      const key = comparablePath(project.path);
      map.set(key, {
        key,
        path: project.path,
        label: project.alias?.trim() || basename(project.path),
        pinOrder: project.pinOrder ?? null,
        sortOrder: project.sortOrder ?? null,
        sessions: [],
      });
    }
    for (const session of sessions) {
      const root = session.projectRoot ?? session.cwd;
      const key = comparablePath(root);
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          path: root,
          label: basename(root),
          pinOrder: null,
          sortOrder: null,
          sessions: [],
        };
        map.set(key, group);
      }
      group.sessions.push(session);
    }
    for (const group of map.values()) group.sessions.sort(byRecency);
    return [...map.values()].sort(projectOrder);
  }, [projects, sessions]);

  const needle = query.trim().toLowerCase();
  const activeSessions = useMemo(() => {
    return sessions
      .filter((session) => running.has(session.id))
      .filter((session) => !needle
        || sessionLabel(session).toLowerCase().includes(needle)
        || session.cwd.toLowerCase().includes(needle))
      .sort(byRecency);
  }, [needle, running, sessions]);

  const visibleGroups = useMemo(() => {
    if (!needle) return groups;
    return groups
      .map((group) => ({
        ...group,
        sessions: group.sessions.filter((session) => (
          sessionLabel(session).toLowerCase().includes(needle)
          || session.cwd.toLowerCase().includes(needle)
        )),
      }))
      .filter((group) => group.label.toLowerCase().includes(needle) || group.path.toLowerCase().includes(needle) || group.sessions.length > 0);
  }, [groups, needle]);

  const toggleGroup = (key: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderSession = (session: SessionSummary, groupLabel?: string) => {
    const active = session.id === selected;
    return (
      <button
        key={session.id}
        className={active ? styles.sessionActive : styles.session}
        onClick={() => onSelect(session.id)}
        title={session.cwd}
      >
        <span className={running.has(session.id) ? styles.dotRunning : styles.dot} />
        <span className={styles.sessionText}>
          <span className={styles.sessionName}>{sessionLabel(session)}</span>
          {groupLabel ? <span className={styles.sessionProject}>{groupLabel}</span> : null}
        </span>
        <span className={styles.sessionMeta}>{sessionTime(session)}</span>
      </button>
    );
  };

  return (
    <aside className={styles.rail}>
      <header className={styles.header}>
        <span className={styles.brand}>omp</span>
        <div className={styles.headerActions}>
          <button className={styles.iconButton} onClick={onRefresh} title="Refresh sessions">↻</button>
          <button className={styles.iconButton} onClick={onCollapse} title="Hide session rail">«</button>
        </div>
      </header>

      <div className={styles.searchWrap}>
        <input
          className={styles.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter projects and sessions"
          spellCheck={false}
        />
      </div>

      <div className={styles.scroll}>
        {error ? <p className={styles.error}>{error}</p> : null}
        {loading && sessions.length === 0 ? <p className={styles.muted}>Loading sessions…</p> : null}

        {activeSessions.length > 0 ? (
          <section className={styles.section}>
            <div className={styles.sectionLabel}>Active</div>
            {activeSessions.map((session) => {
              const group = groups.find((candidate) => candidate.sessions.some((item) => item.id === session.id));
              return renderSession(session, group?.label);
            })}
          </section>
        ) : null}

        <section className={styles.section}>
          <div className={styles.sectionLabel}>Projects</div>
          {visibleGroups.map((group) => {
            const isCollapsed = collapsed.has(group.key);
            return (
              <div key={group.key} className={styles.group}>
                <button className={styles.groupHeader} onClick={() => toggleGroup(group.key)} title={group.path}>
                  <span className={styles.chevron}>{isCollapsed ? "▸" : "▾"}</span>
                  <span className={styles.groupLabel}>{group.label}</span>
                  <span className={styles.groupCount}>{group.sessions.length}</span>
                </button>
                {isCollapsed ? null : (
                  <div className={styles.groupSessions}>
                    {group.sessions.length === 0 ? <span className={styles.emptyGroup}>No sessions</span> : null}
                    {group.sessions.map((session) => renderSession(session))}
                  </div>
                )}
              </div>
            );
          })}
          {!loading && visibleGroups.length === 0 ? <p className={styles.muted}>No sessions</p> : null}
        </section>
      </div>
    </aside>
  );
}
