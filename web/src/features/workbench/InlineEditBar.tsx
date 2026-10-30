import styles from "./inline-edit.module.css";

interface InlineEditBarProps {
  instruction: string;
  busy: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function InlineEditBar({ instruction, busy, error, onChange, onSubmit, onCancel }: InlineEditBarProps) {
  return (
    <div className={styles.bar} role="dialog" aria-label="Inline edit">
      <input
        className={styles.input}
        aria-label="Inline edit instruction"
        placeholder="Describe the change…"
        value={instruction}
        autoFocus
        disabled={busy}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      <button className={styles.send} onClick={onSubmit} disabled={busy || !instruction.trim()}>
        {busy ? "Sending…" : "Send"}
      </button>
      <button className={styles.cancel} onClick={onCancel} disabled={busy}>
        Cancel
      </button>
      {error ? <span className={styles.error} role="alert">{error}</span> : null}
    </div>
  );
}
