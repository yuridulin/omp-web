/**
 * Extension UI surface: the questions an extension may ask the user, the
 * status and widget entries it may publish, and the panel it may open.
 *
 * The runtime asks one dialog at a time, so a new request replaces whatever is
 * on screen. `answeredId` is the dialog this client just answered: a broadcast
 * "cancel" for that id must not tear down the hand-off window, while a cancel
 * for any other id only closes a matching open dialog.
 */

export type ExtensionDialogMethod = "select" | "confirm" | "input" | "editor" | "ask";

export interface ExtensionQuestion {
  question: string;
  options?: readonly { label: string; description?: string }[];
  multi?: boolean;
}

export interface ExtensionDialog {
  id: string;
  method: ExtensionDialogMethod;
  title: string;
  /** select */
  options?: readonly string[];
  /** confirm */
  message?: string;
  /** input */
  placeholder?: string;
  /** editor */
  prefill?: string;
  /** editor: prose answers (ask "Other") */
  promptStyle?: boolean;
  /** ask */
  questions?: readonly ExtensionQuestion[];
  timeoutMs?: number;
  expiresAt?: number;
}

export interface ExtensionStatusItem {
  key: string;
  text: string;
}

export interface ExtensionWidget {
  key: string;
  lines: readonly string[];
  placement: "aboveEditor" | "belowEditor";
}

export interface ExtensionPanel {
  id: string;
  title?: string;
}

export interface ExtensionsState {
  dialog: ExtensionDialog | null;
  answeredId: string | null;
  statuses: readonly ExtensionStatusItem[];
  widgets: readonly ExtensionWidget[];
  panel: ExtensionPanel | null;
}

export const EMPTY_EXTENSIONS: ExtensionsState = {
  dialog: null,
  answeredId: null,
  statuses: [],
  widgets: [],
  panel: null,
};

export type ExtensionEvent =
  | { type: "dialog"; dialog: ExtensionDialog }
  | { type: "cancel"; targetId: string }
  | { type: "answered"; id: string }
  | { type: "status"; key: string; text: string | null }
  | { type: "widget"; key: string; lines: readonly string[] | null; placement?: "aboveEditor" | "belowEditor" }
  | { type: "panel-open"; panel: ExtensionPanel }
  | { type: "panel-close"; id: string }
  | { type: "reset" };

export function reduceExtensions(state: ExtensionsState, event: ExtensionEvent): ExtensionsState {
  switch (event.type) {
    case "dialog":
      // Latest request wins; anything the previous dialog was awaiting is moot.
      return { ...state, dialog: event.dialog, answeredId: null };
    case "cancel":
      if (state.dialog?.id !== event.targetId || state.answeredId === event.targetId) return state;
      return { ...state, dialog: null };
    case "answered":
      return { ...state, answeredId: event.id };
    case "status": {
      const statuses = upsertStatus(state.statuses, event.key, event.text);
      return statuses === state.statuses ? state : { ...state, statuses };
    }
    case "widget": {
      const widgets = upsertWidget(state.widgets, event.key, event.lines, event.placement ?? "aboveEditor");
      return widgets === state.widgets ? state : { ...state, widgets };
    }
    case "panel-open":
      return { ...state, panel: event.panel };
    case "panel-close":
      return state.panel?.id === event.id ? { ...state, panel: null } : state;
    case "reset":
      return EMPTY_EXTENSIONS;
  }
}

function upsertStatus(
  items: readonly ExtensionStatusItem[],
  key: string,
  text: string | null,
): readonly ExtensionStatusItem[] {
  const index = items.findIndex((item) => item.key === key);
  if (!text) return index < 0 ? items : items.filter((item) => item.key !== key);
  if (index < 0) return [...items, { key, text }];
  return items.map((item, i) => (i === index ? { key, text } : item));
}

function upsertWidget(
  items: readonly ExtensionWidget[],
  key: string,
  lines: readonly string[] | null,
  placement: "aboveEditor" | "belowEditor",
): readonly ExtensionWidget[] {
  const index = items.findIndex((item) => item.key === key);
  if (!lines || lines.length === 0) return index < 0 ? items : items.filter((item) => item.key !== key);
  if (index < 0) return [...items, { key, lines, placement }];
  return items.map((item, i) => (i === index ? { key, lines, placement } : item));
}

export type ExtensionAnswer =
  | { value: string }
  | { confirmed: boolean }
  | { cancelled: true }
  | { answers: readonly { question: string; answer: string }[] };

/** Build the `extension_ui_response` payload for a dialog. */
export function responseFor(dialog: ExtensionDialog, answer: ExtensionAnswer): { id: string } & ExtensionAnswer {
  if ("value" in answer) return { id: dialog.id, value: answer.value };
  if ("confirmed" in answer) return { id: dialog.id, confirmed: answer.confirmed };
  if ("cancelled" in answer) return { id: dialog.id, cancelled: true };
  return { id: dialog.id, answers: answer.answers };
}
