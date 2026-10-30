import { useCallback, useSyncExternalStore } from "react";
import { isRecord } from "@/api/guards";

/**
 * Blocking extension UI requests pushed over the session SSE channel. At most
 * one request is pending per session; a newer request replaces the old one and
 * an explicit cancel only clears a matching request id. React reads through
 * `useExtensionRequest`.
 */

export interface ExtensionOption {
  label: string;
  description?: string;
  preview?: string;
}

export interface ExtensionQuestion {
  id: string;
  question: string;
  header?: string;
  options: ExtensionOption[];
  multi?: boolean;
  recommended?: number;
}

interface ExtensionRequestBase {
  id: string;
  title: string;
  expiresAt?: number;
}

export interface ExtensionSelectRequest extends ExtensionRequestBase {
  method: "select";
  options: string[];
}

export interface ExtensionConfirmRequest extends ExtensionRequestBase {
  method: "confirm";
  message: string;
}

export interface ExtensionInputRequest extends ExtensionRequestBase {
  method: "input";
  placeholder?: string;
}

export interface ExtensionEditorRequest extends ExtensionRequestBase {
  method: "editor";
  prefill?: string;
  promptStyle?: boolean;
}

export interface ExtensionAskRequest extends ExtensionRequestBase {
  method: "ask";
  questions: ExtensionQuestion[];
}

export type ExtensionRequest =
  | ExtensionSelectRequest
  | ExtensionConfirmRequest
  | ExtensionInputRequest
  | ExtensionEditorRequest
  | ExtensionAskRequest;

export interface ExtensionAnswer {
  id: string;
  selectedOptions: string[];
  customInput?: string;
}

export type ExtensionResponse =
  | { value: string }
  | { confirmed: boolean }
  | { cancelled: true }
  | { answers: ExtensionAnswer[] };

const requests = new Map<string, ExtensionRequest>();
const listeners = new Map<string, Set<() => void>>();
const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

function emit(sessionId: string): void {
  for (const listener of listeners.get(sessionId) ?? []) listener();
}

function clearExpiry(sessionId: string): void {
  const timer = expiryTimers.get(sessionId);
  if (timer !== undefined) clearTimeout(timer);
  expiryTimers.delete(sessionId);
}

function setRequest(sessionId: string, request: ExtensionRequest): void {
  clearExpiry(sessionId);
  requests.set(sessionId, request);
  const expiresAt = request.expiresAt;
  if (expiresAt !== undefined) {
    const delay = Math.max(0, expiresAt - Date.now());
    const timer = setTimeout(() => {
      if (requests.get(sessionId)?.id !== request.id) return;
      requests.delete(sessionId);
      expiryTimers.delete(sessionId);
      emit(sessionId);
    }, delay);
    expiryTimers.set(sessionId, timer);
  }
  emit(sessionId);
}

function dropRequest(sessionId: string): void {
  clearExpiry(sessionId);
  requests.delete(sessionId);
  emit(sessionId);
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseOption(value: unknown): ExtensionOption | null {
  if (!isRecord(value) || typeof value.label !== "string") return null;
  const description = optionalString(value.description);
  const preview = optionalString(value.preview);
  return {
    label: value.label,
    ...(description !== undefined ? { description } : {}),
    ...(preview !== undefined ? { preview } : {}),
  };
}

function parseQuestion(value: unknown): ExtensionQuestion | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.question !== "string") return null;
  if (!Array.isArray(value.options)) return null;
  const options: ExtensionOption[] = [];
  for (const raw of value.options) {
    const option = parseOption(raw);
    if (!option) return null;
    options.push(option);
  }
  const header = optionalString(value.header);
  const recommended = optionalNumber(value.recommended);
  return {
    id: value.id,
    question: value.question,
    options,
    ...(header !== undefined ? { header } : {}),
    ...(typeof value.multi === "boolean" ? { multi: value.multi } : {}),
    ...(recommended !== undefined ? { recommended } : {}),
  };
}

function parseQuestions(value: unknown): ExtensionQuestion[] | null {
  if (!Array.isArray(value)) return null;
  const questions: ExtensionQuestion[] = [];
  for (const raw of value) {
    const question = parseQuestion(raw);
    if (!question) return null;
    questions.push(question);
  }
  return questions;
}

function parseRequest(frame: Record<string, unknown>): ExtensionRequest | null {
  const id = frame.id;
  const title = frame.title;
  if (typeof id !== "string" || typeof title !== "string") return null;
  const expiresAt = optionalNumber(frame.expiresAt);
  const base = {
    id,
    title,
    ...(expiresAt !== undefined ? { expiresAt } : {}),
  };

  switch (frame.method) {
    case "select": {
      const options = frame.options;
      if (!Array.isArray(options)) return null;
      if (!options.every((option): option is string => typeof option === "string")) return null;
      return { ...base, method: "select", options };
    }
    case "confirm": {
      if (typeof frame.message !== "string") return null;
      return { ...base, method: "confirm", message: frame.message };
    }
    case "input": {
      const placeholder = optionalString(frame.placeholder);
      return { ...base, method: "input", ...(placeholder !== undefined ? { placeholder } : {}) };
    }
    case "editor": {
      const prefill = optionalString(frame.prefill);
      const promptStyle = typeof frame.promptStyle === "boolean" ? frame.promptStyle : undefined;
      return {
        ...base,
        method: "editor",
        ...(prefill !== undefined ? { prefill } : {}),
        ...(promptStyle !== undefined ? { promptStyle } : {}),
      };
    }
    case "ask": {
      const questions = parseQuestions(frame.questions);
      if (!questions) return null;
      return { ...base, method: "ask", questions };
    }
    default:
      return null;
  }
}

export function applyExtensionFrame(
  sessionId: string,
  frame: { type: string; [key: string]: unknown },
): void {
  if (frame.type !== "extension_ui_request") return;

  if (frame.method === "cancel") {
    const targetId = frame.targetId;
    if (typeof targetId !== "string") return;
    if (requests.get(sessionId)?.id !== targetId) return;
    dropRequest(sessionId);
    return;
  }

  const request = parseRequest(frame);
  if (!request) return;
  setRequest(sessionId, request);
}

/** Clear the pending request, or only the request with `id` when given. */
export function clearExtensionRequest(sessionId: string, id?: string): void {
  const current = requests.get(sessionId);
  if (!current) return;
  if (id !== undefined && current.id !== id) return;
  dropRequest(sessionId);
}

export function getExtensionRequest(sessionId: string): ExtensionRequest | null {
  return requests.get(sessionId) ?? null;
}

export function subscribeExtensionRequest(sessionId: string, listener: () => void): () => void {
  let set = listeners.get(sessionId);
  if (!set) {
    set = new Set();
    listeners.set(sessionId, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(sessionId);
  };
}

/** Test seam: drop pending requests without touching the server. */
export function resetExtensionRequests(): void {
  for (const sessionId of expiryTimers.keys()) clearExpiry(sessionId);
  requests.clear();
  listeners.clear();
}

export function useExtensionRequest(sessionId: string | null): ExtensionRequest | null {
  const subscribe = useCallback(
    (listener: () => void) =>
      sessionId ? subscribeExtensionRequest(sessionId, listener) : () => {},
    [sessionId],
  );
  const getSnapshot = useCallback(
    () => (sessionId ? getExtensionRequest(sessionId) : null),
    [sessionId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
