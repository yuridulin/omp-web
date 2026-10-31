import type { ComponentType } from "react";
import type { AppearanceState } from "@/state/appearance-store";
import type { ChangesSlotProps } from "@/slots/changes";
import type { ChatSlotProps } from "@/slots/chat";
import type { FilesSlotProps } from "@/slots/files";
import type { RailSlotProps } from "@/slots/rail";
import { ChangesSkin } from "./dsh/changes/ChangesSkin";
import { ChatSkin } from "./dsh/chat/ChatSkin";
import { FilesSkin } from "./dsh/files/FilesSkin";
import { RailSkin } from "./dsh/rail/RailSkin";

export const DEFAULT_SKIN = "dsh";
export const PRESETS = [DEFAULT_SKIN] as const;

export type SkinSlot = "rail" | "chat" | "files" | "changes";

interface SlotPropsMap {
  rail: RailSlotProps;
  chat: ChatSlotProps;
  files: FilesSlotProps;
  changes: ChangesSlotProps;
}

const SKINS: { [K in SkinSlot]: Record<string, ComponentType<SlotPropsMap[K]>> } = {
  rail: { dsh: RailSkin },
  chat: { dsh: ChatSkin },
  files: { dsh: FilesSkin },
  changes: { dsh: ChangesSkin },
};

/**
 * Resolve a slot through the preset and explicit per-slot override. Unknown
 * variants fall back to the default skin so a stale localStorage entry can
 * never blank a panel.
 */
export function skinFor<K extends SkinSlot>(
  slot: K,
  appearance: AppearanceState,
): ComponentType<SlotPropsMap[K]> {
  const table = SKINS[slot] as Record<string, ComponentType<SlotPropsMap[K]>>;
  const variant = appearance.slots[slot] ?? appearance.preset;
  return table[variant] ?? table[DEFAULT_SKIN]!;
}

export function skinVariants(slot: SkinSlot): string[] {
  return Object.keys(SKINS[slot]);
}
