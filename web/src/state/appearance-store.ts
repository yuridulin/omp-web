/**
 * Client-only appearance selection. A preset names the default skin for every
 * slot; an explicit slot entry overrides just that slot. This is intentionally
 * not server state and never reaches `/api/system/*`.
 */

export const APPEARANCE_KEY = "omp.appearance.v1";
export const DEFAULT_PRESET = "dsh";

export const SLOT_IDS = ["rail", "chat", "files", "changes"] as const;
export type SlotId = (typeof SLOT_IDS)[number];

export interface AppearanceState {
  preset: string;
  slots: Partial<Record<SlotId, string>>;
}

const DEFAULT_STATE: AppearanceState = { preset: DEFAULT_PRESET, slots: {} };

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function isSlotId(value: string): value is SlotId {
  return (SLOT_IDS as readonly string[]).includes(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Total parser: malformed or partial state falls back field by field. */
export function parseAppearance(raw: string | null | undefined): AppearanceState {
  if (typeof raw !== "string" || raw.length === 0) return { ...DEFAULT_STATE, slots: {} };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_STATE, slots: {} };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_STATE, slots: {} };
  const record = value as Record<string, unknown>;
  const slots: Partial<Record<SlotId, string>> = {};
  const rawSlots = record.slots;
  if (rawSlots && typeof rawSlots === "object" && !Array.isArray(rawSlots)) {
    for (const [slot, variant] of Object.entries(rawSlots)) {
      if (!isSlotId(slot) || !nonEmpty(variant)) continue;
      slots[slot] = variant.trim();
    }
  }
  return {
    preset: nonEmpty(record.preset) ? record.preset.trim() : DEFAULT_PRESET,
    slots,
  };
}

function load(): AppearanceState {
  try {
    return parseAppearance(storage()?.getItem(APPEARANCE_KEY));
  } catch {
    return { ...DEFAULT_STATE, slots: {} };
  }
}

let appearance = load();
const listeners = new Set<() => void>();

export function getAppearance(): AppearanceState {
  return appearance;
}

export function subscribeAppearance(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function commit(next: AppearanceState): void {
  if (next.preset === appearance.preset) {
    const previousSlots = Object.keys(appearance.slots);
    const nextSlots = Object.keys(next.slots);
    if (
      previousSlots.length === nextSlots.length
      && previousSlots.every((slot) => appearance.slots[slot as SlotId] === next.slots[slot as SlotId])
    ) {
      return;
    }
  }
  appearance = next;
  try {
    storage()?.setItem(APPEARANCE_KEY, JSON.stringify(appearance));
  } catch {
    // The in-memory choice still applies for this page.
  }
  for (const listener of listeners) listener();
}

export function setAppearancePreset(preset: string): void {
  const value = preset.trim();
  if (!value) return;
  commit({ ...appearance, preset: value });
}

/** Set one slot's explicit variant; pass null to fall back to the preset. */
export function setSlotVariant(slot: SlotId, variant: string | null): void {
  const slots = { ...appearance.slots };
  if (variant === null || variant.trim() === "") delete slots[slot];
  else slots[slot] = variant.trim();
  commit({ ...appearance, slots });
}

/** Slot variant before registry fallback. */
export function resolveSlotVariant(state: AppearanceState, slot: SlotId): string {
  return state.slots[slot] ?? state.preset;
}

/** Test seam: restore defaults and remove the persisted key. */
export function resetAppearanceForTests(): void {
  appearance = { ...DEFAULT_STATE, slots: {} };
  listeners.clear();
  try {
    storage()?.removeItem(APPEARANCE_KEY);
  } catch {
    // ignore
  }
}
