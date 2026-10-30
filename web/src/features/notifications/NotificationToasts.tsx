import { createContext, useContext, type ReactNode } from "react";
import { renderNotification, type NotificationEvent } from "@/api/notifications";
import styles from "./notifications.module.css";

export interface ToastEntry {
  id: string;
  event: NotificationEvent;
}

interface ToastQueueValue {
  toasts: readonly ToastEntry[];
  locale: string;
  dismiss(id: string): void;
  open(event: NotificationEvent): void;
}

const ToastQueueContext = createContext<ToastQueueValue | null>(null);

interface ToastQueueProviderProps {
  toasts: readonly ToastEntry[];
  locale: string;
  onDismiss: (id: string) => void;
  onOpen: (event: NotificationEvent) => void;
  children: ReactNode;
}

export function ToastQueueProvider({
  toasts,
  locale,
  onDismiss,
  onOpen,
  children,
}: ToastQueueProviderProps) {
  return (
    <ToastQueueContext.Provider value={{ toasts, locale, dismiss: onDismiss, open: onOpen }}>
      {children}
    </ToastQueueContext.Provider>
  );
}

/** Fixed bottom-right stack; the provider auto-dismisses each entry after ~6s. */
export function NotificationToasts() {
  const queue = useContext(ToastQueueContext);
  if (!queue || queue.toasts.length === 0) return null;
  return (
    <div className={styles.toasts} aria-live="polite" aria-label="Notifications">
      {queue.toasts.map((toast) => {
        const rendered = renderNotification(toast.event, queue.locale);
        return (
          <div key={toast.id} className={styles.toast}>
            <button
              type="button"
              className={styles.toastBody}
              onClick={() => {
                queue.open(toast.event);
                queue.dismiss(toast.id);
              }}
            >
              <span className={styles.toastTitle}>{rendered.title}</span>
              <span className={styles.toastText}>{rendered.body}</span>
            </button>
            <button
              type="button"
              className={styles.toastClose}
              aria-label={`Dismiss ${rendered.title} notification`}
              onClick={() => queue.dismiss(toast.id)}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
