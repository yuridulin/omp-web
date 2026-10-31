import { useEffect, useMemo, useRef, useState } from "react";
import { basename, comparablePath } from "@/api/paths";
import type { SessionSummary } from "@/api/workspace";
import { NotificationBell } from "@/features/notifications/NotificationBell";
import type { RailSlotProps } from "@/slots/rail";
import { toggleTheme, useTheme } from "@/state/theme";
import {
  ChevronIcon,
  FilterIcon,
  MoonIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  SettingsIcon,
  SidebarIcon,
  SunIcon,
  XIcon,
} from "./icons";
import styles from "./rail.module.css";

interface ProjectGroup {
  key: string;
  path: string;
  label: string;
  pinOrder: number | null;
  sortOrder: number | null;
  sessions: SessionSummary[];
}

const LEADING_EMOJI = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:\uFE0F|\p{Emoji_Modifier})?)*\s*/u;

function sessionLabel(session: SessionSummary): string {
  const raw = session.name?.trim() || session.id.slice(0, 8);
  const label = raw.replace(LEADING_EMOJI, "").trim();
  return label || session.id.slice(0, 8);
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

function matchesQuery(session: SessionSummary, needle: string): boolean {
  return sessionLabel(session).toLowerCase().includes(needle)
    || session.cwd.toLowerCase().includes(needle);
}

export function RailSkin({
  sessions,
  projects,
  selected,
  running,
  loading,
  error,
  onSelect,
  onNewSession,
  onRefresh,
  onCollapse,
  onOpenSettings,
}: RailSlotProps) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [runningOnly, setRunningOnly] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const theme = useTheme();

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

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
      .filter((session) => !needle || matchesQuery(session, needle))
      .sort(byRecency);
  }, [needle, running, sessions]);

  const visibleGroups = useMemo(() => {
    return groups
      .map((group) => {
        let visible = group.sessions;
        if (needle) visible = visible.filter((session) => matchesQuery(session, needle));
        if (runningOnly) visible = visible.filter((session) => running.has(session.id));
        return { ...group, sessions: visible };
      })
      .filter((group) => {
        if (runningOnly) return group.sessions.length > 0;
        if (!needle) return true;
        return group.label.toLowerCase().includes(needle)
          || group.path.toLowerCase().includes(needle)
          || group.sessions.length > 0;
      });
  }, [groups, needle, running, runningOnly]);

  const toggleGroup = (key: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
  };

  const renderSession = (session: SessionSummary, groupLabel?: string) => {
    const active = session.id === selected;
    return (
      <button
        key={session.id}
        type="button"
        className={active ? styles.sessionActive : styles.session}
        onClick={() => onSelect(session.id)}
        title={session.cwd}
        aria-current={active ? "page" : undefined}
      >
        <span className={running.has(session.id) ? styles.dotRunning : styles.dot} aria-hidden="true" />
        <span className={styles.sessionText}>
          <span className={styles.sessionName}>{sessionLabel(session)}</span>
          {groupLabel ? <span className={styles.sessionProject}>{groupLabel}</span> : null}
        </span>
        <span className={styles.sessionMeta}>{sessionTime(session)}</span>
      </button>
    );
  };

  const footerStatus = loading
    ? "Connecting…"
    : `${sessions.length} ${sessions.length === 1 ? "session" : "sessions"}`;

  return (
    <aside className={styles.rail}>
      <header className={styles.header}>
        <span className={styles.brand}>omp</span>
        <div className={styles.headerActions}>
          <NotificationBell />
          <button
            type="button"
            className={styles.iconButton}
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onCollapse}
            title="Hide session rail"
            aria-label="Hide session rail"
          >
            <SidebarIcon />
          </button>
        </div>
      </header>

      <div className={styles.scroll}>
        {error ? <p className={styles.error}>{error}</p> : null}
        {loading && sessions.length === 0 ? <p className={styles.muted}>Loading sessions…</p> : null}

        {activeSessions.length > 0 ? (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionLabel}>Active</span>
            </div>
            {activeSessions.map((session) => {
              const group = groups.find((candidate) => candidate.sessions.some((item) => item.id === session.id));
              return renderSession(session, group?.label);
            })}
          </section>
        ) : null}

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionLabel}>Projects</span>
            <div className={styles.sectionActions}>
              <button
                type="button"
                className={searchOpen ? `${styles.iconButton} ${styles.iconButtonActive}` : styles.iconButton}
                onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
                title={searchOpen ? "Close search" : "Search sessions"}
                aria-label={searchOpen ? "Close search" : "Search sessions"}
                aria-pressed={searchOpen}
              >
                <SearchIcon size={15} />
              </button>
              <button
                type="button"
                className={runningOnly ? `${styles.iconButton} ${styles.iconButtonActive}` : styles.iconButton}
                onClick={() => setRunningOnly((value) => !value)}
                title={runningOnly ? "Show all sessions" : "Show running sessions only"}
                aria-label="Show running sessions only"
                aria-pressed={runningOnly}
              >
                <FilterIcon size={15} />
              </button>
              <button
                type="button"
                className={styles.iconButton}
                onClick={onRefresh}
                title="Refresh sessions"
                aria-label="Refresh sessions"
              >
                <RefreshIcon size={15} />
              </button>
            </div>
          </div>

          {searchOpen ? (
            <div className={styles.searchWrap}>
              <span className={styles.searchIcon}>
                <SearchIcon size={14} />
              </span>
              <input
                ref={searchRef}
                className={styles.search}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") closeSearch();
                }}
                placeholder="Search sessions"
                aria-label="Search sessions"
                spellCheck={false}
              />
              {query ? (
                <button
                  type="button"
                  className={styles.searchClear}
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <XIcon size={13} />
                </button>
              ) : null}
            </div>
          ) : null}

          {visibleGroups.map((group) => {
            const isCollapsed = collapsed.has(group.key);
            return (
              <div key={group.key} className={styles.group}>
                <div className={styles.groupHeaderRow}>
                  <button
                    type="button"
                    className={styles.groupHeader}
                    onClick={() => toggleGroup(group.key)}
                    title={group.path}
                    aria-expanded={!isCollapsed}
                  >
                    <span className={isCollapsed ? `${styles.chevron} ${styles.chevronCollapsed}` : styles.chevron}>
                      <ChevronIcon size={14} />
                    </span>
                    <span className={styles.groupLabel}>{group.label}</span>
                    <span className={styles.groupCount}>{group.sessions.length}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.groupAdd}
                    onClick={() => onNewSession(group.path)}
                    title={`New session in ${group.label}`}
                    aria-label={`New session in ${group.label}`}
                  >
                    <PlusIcon size={14} />
                  </button>
                </div>
                {isCollapsed ? null : (
                  <div className={styles.groupSessions}>
                    {group.sessions.length === 0 ? <span className={styles.emptyGroup}>No sessions</span> : null}
                    {group.sessions.map((session) => renderSession(session))}
                  </div>
                )}
              </div>
            );
          })}
          {!loading && visibleGroups.length === 0 ? (
            <p className={styles.muted}>
              {runningOnly ? "No running sessions" : needle ? "No matching sessions" : "No sessions"}
            </p>
          ) : null}
        </section>
      </div>

      <footer className={styles.footer}>
        <div className={styles.profile}>
          <span className={styles.avatar} aria-hidden="true">o</span>
          <span className={styles.profileText}>
            <span className={styles.profileName}>Local workspace</span>
            <span className={styles.profileStatus}>{footerStatus}</span>
          </span>
          <button
            type="button"
            className={styles.profileAction}
            onClick={onOpenSettings}
            title="System settings (Ctrl/Cmd+,)"
            aria-label="System settings"
          >
            <SettingsIcon size={16} />
          </button>
        </div>
      </footer>
    </aside>
  );
}
