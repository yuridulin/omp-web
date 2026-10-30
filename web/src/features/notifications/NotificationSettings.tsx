import { useNotificationCenter, type NotificationType, type PushStatus } from "@/state/notification-center";
import styles from "./notifications.module.css";

const TYPE_LABELS: Record<NotificationType, string> = {
  completed: "Completed",
  input: "Input needed",
  error: "Errors",
  modelSwitch: "Model switch",
};

const TYPE_ORDER: readonly NotificationType[] = ["completed", "input", "error", "modelSwitch"];

const PUSH_STATUS_TEXT: Record<PushStatus, string> = {
  unsupported: "Push is unavailable in this browser; in-app toasts still work.",
  default: "Push permission has not been requested.",
  granted: "Push permission granted; no subscription yet.",
  denied: "Push permission denied; in-app toasts still work.",
  subscribed: "Push subscription active.",
};

const LOCALES: readonly { value: string; label: string }[] = [
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "zh-CN", label: "简体中文" },
];

/** Compact per-device settings; every change persists locally and to the server. */
export function NotificationSettings() {
  const center = useNotificationCenter();
  const { prefs } = center;

  const toggleEnabled = (enabled: boolean): void => {
    if (enabled) void center.enableNotifications();
    else void center.disableNotifications();
  };

  return (
    <div className={styles.settings}>
      <label className={styles.settingRow}>
        <input
          type="checkbox"
          checked={prefs.enabled}
          disabled={center.busy}
          onChange={(event) => toggleEnabled(event.currentTarget.checked)}
        />
        <span>Enable notifications</span>
      </label>

      <div className={styles.typeGrid}>
        {TYPE_ORDER.map((type) => (
          <label key={type} className={styles.settingRow}>
            <input
              type="checkbox"
              checked={prefs.types[type]}
              disabled={center.busy}
              onChange={(event) =>
                center.setPrefs({
                  ...prefs,
                  types: { ...prefs.types, [type]: event.currentTarget.checked },
                })
              }
            />
            <span>{TYPE_LABELS[type]}</span>
          </label>
        ))}
      </div>

      <label className={styles.settingRow}>
        <span className={styles.settingLabel}>While active</span>
        <select
          className={styles.select}
          value={prefs.whenActive}
          disabled={center.busy}
          onChange={(event) =>
            center.setPrefs({
              ...prefs,
              whenActive: event.currentTarget.value === "system" ? "system" : "toast",
            })
          }
        >
          <option value="toast">In-app toast</option>
          <option value="system">System notification</option>
        </select>
      </label>

      <label className={styles.settingRow}>
        <span className={styles.settingLabel}>Language</span>
        <select
          className={styles.select}
          value={prefs.locale}
          disabled={center.busy}
          onChange={(event) => center.setPrefs({ ...prefs, locale: event.currentTarget.value })}
        >
          {prefs.locale !== "" && !LOCALES.some((locale) => locale.value === prefs.locale) ? (
            <option value={prefs.locale}>{prefs.locale}</option>
          ) : null}
          {LOCALES.map((locale) => (
            <option key={locale.value} value={locale.value}>
              {locale.label}
            </option>
          ))}
        </select>
      </label>

      <p className={styles.pushStatus}>{PUSH_STATUS_TEXT[center.pushStatus]}</p>
      {center.error ? <p className={styles.error}>{center.error}</p> : null}

      <button
        type="button"
        className={styles.testButton}
        disabled={center.busy}
        onClick={() => void center.sendTest()}
      >
        Send test notification
      </button>
    </div>
  );
}
