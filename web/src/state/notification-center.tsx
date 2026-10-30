import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  clearNotificationHistory,
  countUnread,
  createNotificationId,
  deleteNotificationHistoryEntry,
  fetchNotificationDevice,
  fetchNotificationHistory,
  isValidNotificationId,
  markNotificationHistoryRead,
  parseNotificationFrame,
  parseNotificationPrefs,
  renderNotification,
  reportNotificationPresence,
  saveNotificationDevice,
  sendTestNotification,
  urlBase64ToUint8Array,
  type NotificationEvent,
  type NotificationHistoryEntry,
  type NotificationPrefs,
} from "@/api/notifications";
import { NotificationToasts, ToastQueueProvider, type ToastEntry } from "@/features/notifications/NotificationToasts";
import { useChannel } from "@/state/event-stream";

export type {
  NotificationEvent,
  NotificationHistoryEntry,
  NotificationPrefs,
  NotificationType,
} from "@/api/notifications";

export type PushStatus = "unsupported" | "default" | "granted" | "denied" | "subscribed";

export interface NotificationCenterValue {
  clientId: string;
  deviceId: string;
  prefs: NotificationPrefs;
  history: NotificationHistoryEntry[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  busy: boolean;
  pushStatus: PushStatus;
  setPrefs(next: NotificationPrefs): void;
  enableNotifications(): Promise<void>;
  disableNotifications(): Promise<void>;
  sendTest(): Promise<void>;
  markAllRead(): Promise<void>;
  /** Mark specific entries read (history-row clicks); takes at most the server's 100-id batch. */
  markRead(ids: readonly string[]): Promise<void>;
  removeEntry(id: string): Promise<void>;
  clearHistory(): Promise<void>;
  selectSession(sessionId: string): void;
}

const NotificationCenterContext = createContext<NotificationCenterValue | null>(null);

const NOTIFICATION_HISTORY_QUERY_KEY = ["notification-history"] as const;
const PREFS_STORAGE_KEY = "omp.notifications.prefs.v1";
const DEVICE_ID_STORAGE_KEY = "omp.notifications.deviceId.v1";
const PRESENCE_INTERVAL_MS = 20_000;
/** A visible tab stops counting as the user being present after this long without input. */
const IDLE_AFTER_MS = 3 * 60_000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "focus"] as const;
const TOAST_DURATION_MS = 6_000;
const MAX_TOASTS = 5;
const MAX_READ_BATCH = 100;
const EMPTY_HISTORY: NotificationHistoryEntry[] = [];

/**
 * One id per page load: presence is per tab, and a duplicated tab would copy
 * any stored value, so neither localStorage nor sessionStorage can hold it.
 */
const notificationClientId = createNotificationId();

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function readOrCreateId(key: string): string {
  try {
    const stored = storage()?.getItem(key);
    if (stored && isValidNotificationId(stored)) return stored;
  } catch {
    // A blocked storage API falls through to a fresh id.
  }
  const created = createNotificationId();
  try {
    storage()?.setItem(key, created);
  } catch {
    // Persistence is best effort; the id still lives for this page.
  }
  return created;
}

function loadPrefs(): NotificationPrefs {
  try {
    const raw = storage()?.getItem(PREFS_STORAGE_KEY);
    return raw ? parseNotificationPrefs(JSON.parse(raw) as unknown) : parseNotificationPrefs(null);
  } catch {
    return parseNotificationPrefs(null);
  }
}

function storePrefs(prefs: NotificationPrefs): void {
  try {
    storage()?.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Quota or privacy mode: the in-memory prefs still work for this tab.
  }
}

/** Browsers that never saved settings stay off the server's device list. */
function hasStoredPrefs(): boolean {
  try {
    return storage()?.getItem(PREFS_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

function pushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

function permissionStatus(): PushStatus {
  if (!pushSupported()) return "unsupported";
  const permission = Notification.permission;
  return permission === "granted" ? "granted" : permission === "denied" ? "denied" : "default";
}

/** A registered subscription outranks the permission state; `granted` only means push could be requested. */
async function probePushStatus(): Promise<PushStatus> {
  if (!pushSupported()) return "unsupported";
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) return "subscribed";
  } catch {
    // No registration or no push manager: fall back to the permission state.
  }
  return permissionStatus();
}

/** Registering is idempotent; `ready` resolves once the worker can call `pushManager.subscribe`. */
async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

/** A subscription created for another VAPID key cannot receive this server's pushes. */
function usesApplicationServerKey(
  subscription: PushSubscription,
  expected: Uint8Array<ArrayBuffer>,
): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === expected.length && bytes.every((byte, index) => byte === expected[index]);
}

interface NotificationProviderProps {
  sessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  children: ReactNode;
}

/**
 * Owns this tab's notification identity, presence, history and push
 * subscription. The SSE stream only reports what to show; the server decides
 * who receives a notification from presence reports.
 */
export function NotificationProvider({ sessionId, onSelectSession, children }: NotificationProviderProps) {
  const queryClient = useQueryClient();
  const [deviceId] = useState(() => readOrCreateId(DEVICE_ID_STORAGE_KEY));
  const clientId = notificationClientId;
  const [prefs, setPrefsState] = useState<NotificationPrefs>(loadPrefs);
  const [pushStatus, setPushStatus] = useState<PushStatus>(permissionStatus);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const selectSessionRef = useRef(onSelectSession);
  selectSessionRef.current = onSelectSession;

  const sequenceRef = useRef(0);
  const toastTimers = useRef(new Map<string, number>());
  const toastSequence = useRef(0);

  const historyQuery = useQuery({
    queryKey: NOTIFICATION_HISTORY_QUERY_KEY,
    queryFn: ({ signal }) => fetchNotificationHistory(signal),
  });
  const history = historyQuery.data ?? EMPTY_HISTORY;
  const unreadCount = useMemo(() => countUnread(history), [history]);

  const dismissToast = (id: string): void => {
    const timer = toastTimers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      toastTimers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  const enqueueToast = (event: NotificationEvent): void => {
    const id = `toast-${(toastSequence.current += 1)}`;
    setToasts((current) => [...current.slice(-(MAX_TOASTS - 1)), { id, event }]);
    toastTimers.current.set(
      id,
      window.setTimeout(() => dismissToast(id), TOAST_DURATION_MS),
    );
  };

  const showSystemNotification = (event: NotificationEvent): void => {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        const rendered = renderNotification(event, prefsRef.current.locale);
        const notification = new Notification(rendered.title, {
          body: rendered.body,
          tag: rendered.tag,
          data: { url: rendered.url, sessionId: rendered.sessionId },
        });
        notification.onclick = () => {
          window.focus();
          notification.close();
          openNotification(event);
        };
        return;
      } catch {
        // Some browsers refuse constructor notifications; the in-app toast remains.
      }
    }
    enqueueToast(event);
  };

  // Every frame invalidates history; the server already persisted it.
  useChannel(
    { kind: "notifications", clientId },
    (frame) => {
      const message = parseNotificationFrame(frame);
      if (!message) return;
      void queryClient.invalidateQueries({ queryKey: NOTIFICATION_HISTORY_QUERY_KEY });
      if (message.kind === "os") showSystemNotification(message.event);
      else enqueueToast(message.event);
    },
    (message) => setActionError(message),
  );

  // Presence: which session this tab shows, whether the user is here, and a
  // monotonically increasing seq so out-of-order reports cannot win.
  useEffect(() => {
    let lastInput = Date.now();
    let reportedVisible: boolean | null = null;
    const present = (): boolean =>
      document.visibilityState === "visible" && Date.now() - lastInput < IDLE_AFTER_MS;
    const report = (visible: boolean = present()): void => {
      reportedVisible = visible;
      sequenceRef.current += 1;
      void reportNotificationPresence({
        clientId,
        deviceId,
        visible,
        sessionId,
        seq: sequenceRef.current,
      }).catch(() => {
        // Presence is best effort; the next interval retries.
      });
    };
    const handleActivity = (): void => {
      lastInput = Date.now();
      if (reportedVisible === false && present()) report(true);
    };
    const handleVisibility = (): void => {
      report();
      if (document.visibilityState === "visible") {
        void queryClient.invalidateQueries({ queryKey: NOTIFICATION_HISTORY_QUERY_KEY });
      }
    };
    const handlePageHide = (): void => report(false);
    report();
    const timer = window.setInterval(() => {
      // Keep-alive while present; one report when the user goes idle.
      if (present() || reportedVisible === true) report();
    }, PRESENCE_INTERVAL_MS);
    for (const name of ACTIVITY_EVENTS) {
      window.addEventListener(name, handleActivity, { passive: true, capture: true });
    }
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.clearInterval(timer);
      for (const name of ACTIVITY_EVENTS) {
        window.removeEventListener(name, handleActivity, { capture: true });
      }
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [clientId, deviceId, queryClient, sessionId]);

  // Keep the server's view of this device in sync with local prefs, and reuse
  // an existing browser subscription when there is one.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const status = await probePushStatus();
      if (cancelled) return;
      setPushStatus(status);
      // Browsers that never saved settings stay off the server's device list.
      if (!hasStoredPrefs()) return;
      let subscription: PushSubscriptionJSON | null = null;
      if (status === "subscribed") {
        try {
          const registration = await navigator.serviceWorker.getRegistration("/");
          const current = await registration?.pushManager.getSubscription();
          if (current) subscription = current.toJSON();
        } catch {
          // Keep the prefs sync below even when the subscription cannot be read.
        }
      }
      if (cancelled) return;
      try {
        await saveNotificationDevice({
          deviceId,
          prefs: prefsRef.current,
          ...(subscription ? { subscription } : {}),
        });
      } catch {
        // The server may not be reachable yet; settings still works locally.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  useEffect(() => {
    const timers = toastTimers.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);

  // Another tab of this browser changed the prefs: adopt them without echoing
  // a server write (that tab already saved them).
  useEffect(() => {
    const handleStorage = (event: StorageEvent): void => {
      if (event.key !== PREFS_STORAGE_KEY) return;
      const next = loadPrefs();
      setPrefsState(next);
      prefsRef.current = next;
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const persistPrefs = (next: NotificationPrefs): void => {
    setPrefsState(next);
    prefsRef.current = next;
    storePrefs(next);
  };

  const savePrefsToServer = (next: NotificationPrefs): void => {
    void saveNotificationDevice({ deviceId, prefs: next }).catch((cause: unknown) => {
      setActionError(errorMessage(cause));
    });
  };

  const setPrefs = (next: NotificationPrefs): void => {
    persistPrefs(next);
    savePrefsToServer(next);
  };

  const enableNotifications = async (): Promise<void> => {
    setBusy(true);
    setActionError(null);
    const next: NotificationPrefs = { ...prefsRef.current, enabled: true };
    persistPrefs(next);
    try {
      if (!pushSupported()) {
        setPushStatus("unsupported");
        await saveNotificationDevice({ deviceId, prefs: next });
        return;
      }
      let permission: NotificationPermission;
      try {
        permission = await Notification.requestPermission();
      } catch {
        permission = Notification.permission;
      }
      if (permission !== "granted") {
        setPushStatus(permission === "denied" ? "denied" : "default");
        await saveNotificationDevice({ deviceId, prefs: next });
        return;
      }
      setPushStatus("granted");
      let registration: ServiceWorkerRegistration;
      try {
        registration = await ensureServiceWorker();
      } catch (cause) {
        setActionError(errorMessage(cause));
        await saveNotificationDevice({ deviceId, prefs: next });
        return;
      }
      let subscription = await registration.pushManager.getSubscription();
      const { publicKey, subscribed } = await fetchNotificationDevice(deviceId);
      const applicationServerKey = urlBase64ToUint8Array(publicKey);
      // Replace a subscription signed for other server keys, or one the server
      // dropped after the push service reported it gone (re-sending it loops).
      if (subscription && (!usesApplicationServerKey(subscription, applicationServerKey) || !subscribed)) {
        await subscription.unsubscribe().catch(() => false);
        subscription = null;
      }
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }
      await saveNotificationDevice({
        deviceId,
        prefs: next,
        subscription: subscription.toJSON(),
      });
      setPushStatus("subscribed");
    } catch (cause) {
      // Enabled prefs still deliver in-app toasts when push cannot be set up.
      setActionError(errorMessage(cause));
      void saveNotificationDevice({ deviceId, prefs: next }).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const disableNotifications = async (): Promise<void> => {
    setBusy(true);
    setActionError(null);
    const next: NotificationPrefs = { ...prefsRef.current, enabled: false };
    persistPrefs(next);
    try {
      await saveNotificationDevice({ deviceId, prefs: next });
    } catch (cause) {
      setActionError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async (): Promise<void> => {
    setBusy(true);
    setActionError(null);
    try {
      if (pushStatus === "subscribed") {
        await sendTestNotification(deviceId);
      } else {
        enqueueToast({ type: "test", sessionId: "", sessionName: "omp web" });
      }
    } catch (cause) {
      setActionError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const markRead = async (ids: readonly string[]): Promise<void> => {
    const unique = [...new Set(ids)].slice(0, MAX_READ_BATCH);
    if (unique.length === 0) return;
    setBusy(true);
    setActionError(null);
    try {
      await markNotificationHistoryRead(unique);
      await queryClient.invalidateQueries({ queryKey: NOTIFICATION_HISTORY_QUERY_KEY });
    } catch (cause) {
      setActionError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const markAllRead = async (): Promise<void> => {
    await markRead(history.filter((entry) => !entry.read).map((entry) => entry.id));
  };

  /** Toast / system-notification click: the history id is the replace tag, so mark it read and open the session. */
  const openNotification = (event: NotificationEvent): void => {
    if (!event.sessionId) return;
    void markRead([`${event.sessionId}:${event.type}`]);
    selectSessionRef.current(event.sessionId);
  };

  const removeEntry = async (id: string): Promise<void> => {
    setBusy(true);
    setActionError(null);
    try {
      await deleteNotificationHistoryEntry(id);
      await queryClient.invalidateQueries({ queryKey: NOTIFICATION_HISTORY_QUERY_KEY });
    } catch (cause) {
      setActionError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const clearHistory = async (): Promise<void> => {
    setBusy(true);
    setActionError(null);
    try {
      await clearNotificationHistory();
      await queryClient.invalidateQueries({ queryKey: NOTIFICATION_HISTORY_QUERY_KEY });
    } catch (cause) {
      setActionError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const selectSession = (id: string): void => {
    if (!id) return;
    selectSessionRef.current(id);
  };

  const value: NotificationCenterValue = {
    clientId,
    deviceId,
    prefs,
    history,
    unreadCount,
    loading: historyQuery.isPending,
    error: actionError ?? (historyQuery.error ? errorMessage(historyQuery.error) : null),
    busy,
    pushStatus,
    setPrefs,
    enableNotifications,
    disableNotifications,
    sendTest,
    markAllRead,
    markRead,
    removeEntry,
    clearHistory,
    selectSession,
  };

  return (
    <NotificationCenterContext.Provider value={value}>
      <ToastQueueProvider
        toasts={toasts}
        locale={prefs.locale}
        onDismiss={dismissToast}
        onOpen={openNotification}
      >
        {children}
        <NotificationToasts />
      </ToastQueueProvider>
    </NotificationCenterContext.Provider>
  );
}

export function useNotificationCenter(): NotificationCenterValue {
  const value = useContext(NotificationCenterContext);
  if (!value) throw new Error("useNotificationCenter must be used inside NotificationProvider");
  return value;
}
