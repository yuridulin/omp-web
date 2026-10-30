import { useEffect, useRef, useState } from "react";
import { renderNotification } from "@/api/notifications";
import {
  useNotificationCenter,
  type NotificationHistoryEntry,
} from "@/state/notification-center";
import { NotificationSettings } from "./NotificationSettings";
import styles from "./notifications.module.css";

function relativeTime(at: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Bell button plus the fixed history/settings popover. */
export function NotificationBell() {
  const center = useNotificationCenter();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Node && wrapRef.current && !wrapRef.current.contains(target)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const openEntry = (entry: NotificationHistoryEntry): void => {
    if (!entry.read) void center.markRead([entry.id]);
    center.selectSession(entry.event.sessionId);
    setOpen(false);
  };

  const label = center.unreadCount > 0 ? `Notifications, ${center.unreadCount} unread` : "Notifications";

  return (
    <div ref={wrapRef} className={styles.bellWrap}>
      <button
        type="button"
        className={styles.bellButton}
        aria-label={label}
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((current) => !current)}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {center.unreadCount > 0 ? (
          <span className={styles.badge}>{center.unreadCount > 99 ? "99+" : center.unreadCount}</span>
        ) : null}
      </button>

      {open ? (
        <div className={styles.panel} role="dialog" aria-label="Notifications">
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Notifications</span>
            <div className={styles.panelActions}>
              <button
                type="button"
                className={styles.action}
                disabled={center.busy || center.unreadCount === 0}
                onClick={() => void center.markAllRead()}
              >
                Mark all read
              </button>
              <button
                type="button"
                className={styles.action}
                disabled={center.busy || center.history.length === 0}
                onClick={() => void center.clearHistory()}
              >
                Clear
              </button>
              <button
                type="button"
                className={styles.action}
                aria-label="Close notifications"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>
          </div>

          <div className={styles.history}>
            {center.loading ? (
              <p className={styles.empty}>Loading…</p>
            ) : center.history.length === 0 ? (
              <p className={styles.empty}>No notifications yet.</p>
            ) : (
              center.history.map((entry) => {
                const rendered = renderNotification(entry.event, center.prefs.locale);
                return (
                  <div
                    key={entry.id}
                    className={entry.read ? styles.entry : `${styles.entry} ${styles.unreadEntry}`}
                  >
                    <button type="button" className={styles.entryMain} onClick={() => openEntry(entry)}>
                      <span className={styles.entryTitle}>{rendered.title}</span>
                      <span className={styles.entryBody}>{rendered.body}</span>
                      <span className={styles.entryTime}>{relativeTime(entry.at)}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.removeButton}
                      aria-label={`Remove ${rendered.title} notification`}
                      disabled={center.busy}
                      onClick={() => void center.removeEntry(entry.id)}
                    >
                      ×
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className={styles.settingsSection}>
            <div className={styles.sectionTitle}>Settings</div>
            <NotificationSettings />
          </div>
        </div>
      ) : null}
    </div>
  );
}
