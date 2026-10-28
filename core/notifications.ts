import { isRecord } from "./guards";

/**
 * Notification domain: what an event is, how prefs are validated, how a
 * notification renders in the reader's language, which frames raise one, and
 * how the persisted history list changes.
 *
 * Detection is a stateful fold over top-level rpc-ui frames, so the server can
 * notify for sessions no tab watches. Subagent activity arrives wrapped in
 * `subagent_*` frames and is never inspected.
 */

export const NOTIFICATION_TYPES = ["completed", "input", "error", "modelSwitch"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationEvent {
  /** `test` is only sent by the settings "Send test notification" button. */
  type: NotificationType | "test";
  sessionId: string;
  sessionName: string | null;
  /** Question, error text, or model-switch reason. */
  detail?: string;
  from?: string;
  to?: string;
  /** Earlier ids of this conversation (omp moved it to a new file); tabs may still show one. */
  aliases?: string[];
}

/** One entry of the persisted notification history; `id` is the replace-tag `<sessionId>:<type>`. */
export interface NotificationHistoryEntry {
  id: string;
  event: NotificationEvent;
  at: number;
  read: boolean;
}

export interface NotificationPrefs {
  enabled: boolean;
  types: Record<NotificationType, boolean>;
  /** While the user is active in another omp-web tab: in-app toast or system notification. */
  whenActive: "toast" | "system";
  /** UI locale, so pushes are written in the device's language. */
  locale: string;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: false,
  types: { completed: true, input: true, error: true, modelSwitch: false },
  whenActive: "toast",
  locale: "en",
};

/** Validate untrusted prefs (request bodies, localStorage); unknown fields fall back to defaults. */
export function parseNotificationPrefs(value: unknown): NotificationPrefs {
  const raw = isRecord(value) ? value : {};
  const rawTypes = isRecord(raw.types) ? raw.types : {};
  const types = { ...DEFAULT_NOTIFICATION_PREFS.types };
  for (const type of NOTIFICATION_TYPES) {
    if (typeof rawTypes[type] === "boolean") types[type] = rawTypes[type];
  }
  return {
    enabled: raw.enabled === true,
    types,
    whenActive: raw.whenActive === "system" ? "system" : "toast",
    locale: typeof raw.locale === "string" && /^[A-Za-z-]{2,10}$/.test(raw.locale) ? raw.locale : "en",
  };
}

/** Parse one persisted history entry; null when the row is unusable. */
export function parseNotificationHistoryEntry(value: unknown): NotificationHistoryEntry | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  if (!isRecord(value.event)) return null;
  const event = value.event;
  if (typeof event.sessionId !== "string" || typeof event.type !== "string") return null;
  if (typeof value.at !== "number" || !Number.isFinite(value.at)) return null;
  if (typeof value.read !== "boolean") return null;
  return {
    id: value.id,
    event: {
      type: event.type as NotificationEvent["type"],
      sessionId: event.sessionId,
      sessionName: typeof event.sessionName === "string" ? event.sessionName : null,
      ...(typeof event.detail === "string" ? { detail: event.detail } : {}),
      ...(typeof event.from === "string" ? { from: event.from } : {}),
      ...(typeof event.to === "string" ? { to: event.to } : {}),
      ...(Array.isArray(event.aliases) && event.aliases.every((id) => typeof id === "string")
        ? { aliases: event.aliases as string[] }
        : {}),
    },
    at: value.at,
    read: value.read,
  };
}

/** Parse the server's history payload; malformed rows are dropped individually. */
export function parseNotificationHistory(value: unknown): NotificationHistoryEntry[] {
  if (!isRecord(value) || !Array.isArray(value.entries)) return [];
  return value.entries.flatMap((entry) => {
    const parsed = parseNotificationHistoryEntry(entry);
    return parsed ? [parsed] : [];
  });
}

export interface RenderedNotification {
  title: string;
  body: string;
  url: string;
  tag: string;
  sessionId: string;
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

const MAX_DETAIL = 180;
/** Session names can be pasted at any length; push payloads are capped near 4 KB. */
const MAX_TITLE = 100;

function clip(text: string, max = MAX_DETAIL): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Title, body, click target, and replace-tag for one event in the caller's language. */
export function renderNotification(event: NotificationEvent, t: Translate): RenderedNotification {
  const detail = event.detail ? clip(event.detail) : "";
  let body: string;
  switch (event.type) {
    case "completed":
      body = t("notifications.completedBody");
      break;
    case "input":
      body = detail ? t("notifications.inputBody", { detail }) : t("notifications.inputBodyNoDetail");
      break;
    case "error":
      body = detail ? t("notifications.errorBody", { detail }) : t("notifications.errorBodyNoDetail");
      break;
    case "modelSwitch":
      if (event.from && event.to) {
        body = detail
          ? t("notifications.modelSwitchBody", { from: event.from, to: event.to, detail })
          : t("notifications.modelSwitchBodyNoDetail", { from: event.from, to: event.to });
      } else {
        body = detail;
      }
      break;
    case "test":
      body = t("notifications.testBody");
      break;
  }
  return {
    title: (event.sessionName && clip(event.sessionName, MAX_TITLE)) || t("notifications.untitledSession"),
    body,
    url: event.sessionId ? `/?session=${encodeURIComponent(event.sessionId)}` : "/",
    tag: `${event.sessionId}:${event.type}`,
    sessionId: event.sessionId,
  };
}

const MODEL_SWITCH_NOTICE_SOURCES: Record<string, true> = { prewalk: true, "plan-yolo": true };

/** Extension UI methods that block the agent until the user answers (rpc-manager replays these too). */
export const BLOCKING_UI_METHODS: Record<string, true> = { select: true, confirm: true, input: true, editor: true, ask: true, open_url: true };

const NOTIFICATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** Client and device ids: generated by the browser, checked by the server. */
export function isValidNotificationId(value: unknown): value is string {
  return typeof value === "string" && NOTIFICATION_ID_PATTERN.test(value);
}

const str = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value : undefined);

export type Detect = (
  frame: Record<string, unknown>,
  session: { sessionId: string; sessionName: string | null },
) => NotificationEvent[];

/**
 * Per-session detector: feed it every top-level rpc-ui frame in order.
 *
 * "completed" fires on `session_settled` (the run and any background work it
 * started are done), unless the last prompt in that stretch failed or was
 * aborted. Errors fire on the failing `prompt_result` itself.
 *
 * omp announces a retry fallback (`retry_fallback_applied`) before the
 * `auto_retry_start` carrying the error that caused it, so a fallback without
 * its own `reason` waits for that frame and takes its error as the reason.
 */
export function createNotificationDetector(): Detect {
  let lastOutcome: string | null = null;
  let heldFallback: NotificationEvent | null = null;
  /** This run's failure was already reported (from a failed `response`); its `prompt_result` must not repeat it. */
  let failureReported = false;

  const releaseFallback = (detail?: string): NotificationEvent[] => {
    const held = heldFallback;
    heldFallback = null;
    return held ? [{ ...held, detail }] : [];
  };

  return (frame, { sessionId, sessionName }) => {
    const base = { sessionId, sessionName };
    switch (frame.type) {
      case "agent_start":
        failureReported = false;
        return [];
      // omp-web's own frames: an async prompt failure (`response` with
      // success: false) and the omp child exiting mid-run.
      case "prompt_error":
      case "process_exit": {
        const events = releaseFallback();
        lastOutcome = "error";
        if (failureReported) return events;
        failureReported = true;
        return [...events, { ...base, type: "error", detail: str(frame.errorMessage) ?? str(frame.detail) }];
      }
      case "auto_retry_start":
        return releaseFallback(str(frame.errorMessage));
      case "retry_fallback_applied": {
        const from = str(frame.from);
        const to = str(frame.to);
        if (!from || !to) return [];
        const event: NotificationEvent = { ...base, type: "modelSwitch", from, to };
        const reason = str(frame.reason);
        if (reason) return [...releaseFallback(), { ...event, detail: reason }];
        const earlier = releaseFallback();
        heldFallback = event;
        return earlier;
      }
      case "notice": {
        const source = str(frame.source);
        const message = str(frame.message);
        if (!source || !message || !Object.hasOwn(MODEL_SWITCH_NOTICE_SOURCES, source)) return [];
        return [{ ...base, type: "modelSwitch", detail: message }];
      }
      case "prompt_result": {
        const events = releaseFallback();
        if (frame.agentInvoked !== true) return events;
        lastOutcome = str(frame.status) ?? null;
        if (lastOutcome !== "error" || failureReported) return events;
        failureReported = true;
        return [...events, { ...base, type: "error", detail: isRecord(frame.error) ? str(frame.error.message) : undefined }];
      }
      case "auto_retry_end":
        return releaseFallback();
      case "session_settled": {
        const events = releaseFallback();
        const outcome = lastOutcome;
        lastOutcome = null;
        failureReported = false;
        if (outcome === "error" || outcome === "aborted") return events;
        return [...events, { ...base, type: "completed" }];
      }
      case "extension_ui_request": {
        // Only reached for requests that wait on the user (auto-approved ones
        // are answered before they are emitted).
        if (typeof frame.method !== "string" || !Object.hasOwn(BLOCKING_UI_METHODS, frame.method)) return [];
        const firstQuestion = Array.isArray(frame.questions) && isRecord(frame.questions[0]) ? str(frame.questions[0].question) : undefined;
        return [{ ...base, type: "input", detail: str(frame.title) ?? firstQuestion ?? str(frame.message) ?? str(frame.instructions) }];
      }
      default:
        return [];
    }
  };
}

export const NOTIFICATION_HISTORY_LIMIT = 100;

/** Insert or re-arm one entry: a reused `<sessionId>:<type>` id is unread again and comes first. */
export function addNotificationHistoryEntry(
  entries: readonly NotificationHistoryEntry[],
  event: NotificationEvent,
  at: number,
): NotificationHistoryEntry[] {
  const id = `${event.sessionId}:${event.type}`;
  return [{ id, event, at, read: false }, ...entries.filter((entry) => entry.id !== id)]
    .slice(0, NOTIFICATION_HISTORY_LIMIT);
}

export function markNotificationRead(
  entries: readonly NotificationHistoryEntry[],
  ids: Iterable<string>,
): NotificationHistoryEntry[] {
  const set = new Set(ids);
  if (entries.every((entry) => entry.read || !set.has(entry.id))) return [...entries];
  return entries.map((entry) => (entry.read || !set.has(entry.id) ? entry : { ...entry, read: true }));
}

export function markAllNotificationsRead(
  entries: readonly NotificationHistoryEntry[],
): NotificationHistoryEntry[] {
  return entries.every((entry) => entry.read) ? [...entries] : entries.map((entry) => (entry.read ? entry : { ...entry, read: true }));
}

export function removeNotificationHistoryEntry(
  entries: readonly NotificationHistoryEntry[],
  id: string,
): NotificationHistoryEntry[] {
  return entries.filter((entry) => entry.id !== id);
}

export function unreadNotificationCount(entries: readonly NotificationHistoryEntry[]): number {
  let count = 0;
  for (const entry of entries) if (!entry.read) count += 1;
  return count;
}
