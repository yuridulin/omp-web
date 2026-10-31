import { DEFAULT_SKIN, PRESETS, skinVariants, type SkinSlot } from "@/skins/registry";
import { setAppearancePreset, setSlotVariant } from "@/state/appearance-store";
import { useAppearance } from "@/state/use-appearance";
import styles from "./appearance-panel.module.css";

const SLOTS: readonly { id: SkinSlot; label: string }[] = [
  { id: "rail", label: "Session rail" },
  { id: "chat", label: "Chat" },
  { id: "files", label: "Files" },
  { id: "changes", label: "Changes" },
];

/** Client-only appearance. Nothing here is sent to the server. */
export function AppearancePanel() {
  const appearance = useAppearance();

  return (
    <section className={styles.panel} aria-label="View">
      <label className={styles.field}>
        <span className={styles.label}>Preset</span>
        <select
          className={styles.select}
          aria-label="Appearance preset"
          value={appearance.preset}
          onChange={(event) => setAppearancePreset(event.currentTarget.value)}
        >
          {PRESETS.map((preset) => (
            <option key={preset} value={preset}>{preset}</option>
          ))}
        </select>
      </label>
      <p className={styles.hint}>
        Presets fill every slot; an explicit slot choice overrides just that slot.
        Stored in this browser as <code>omp.appearance.v1</code>.
      </p>
      <div className={styles.slots}>
        {SLOTS.map((slot) => {
          const explicit = appearance.slots[slot.id] ?? "";
          const variants = skinVariants(slot.id);
          return (
            <label key={slot.id} className={styles.field}>
              <span className={styles.label}>{slot.label}</span>
              <select
                className={styles.select}
                aria-label={`${slot.label} skin`}
                value={explicit}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setSlotVariant(slot.id, value === "" ? null : value);
                }}
              >
                <option value="">Preset ({appearance.preset})</option>
                {variants.map((variant) => (
                  <option key={variant} value={variant}>{variant}</option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
      <p className={styles.hint}>Default skin: {DEFAULT_SKIN}</p>
    </section>
  );
}
