import { useSyncExternalStore } from "react";

/** Persisted light/dark mode; light is the default. */

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "omp.theme.v1";
const listeners = new Set<() => void>();

function isMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark";
}

export function readTheme(): ThemeMode {
  if (typeof document !== "undefined") {
    const attr = document.documentElement.dataset.theme;
    if (isMode(attr)) return attr;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isMode(saved)) return saved;
  } catch {
    // Storage can be unavailable (private mode, embedded webview).
  }
  return "light";
}

export function applyTheme(mode: ThemeMode): void {
  document.documentElement.dataset.theme = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // The document attribute still applies for this page.
  }
  for (const listener of listeners) listener();
}

export function toggleTheme(): void {
  applyTheme(readTheme() === "dark" ? "light" : "dark");
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTheme(): ThemeMode {
  return useSyncExternalStore(subscribeTheme, readTheme, () => "light");
}
