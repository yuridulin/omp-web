import type { JSX, KeyboardEvent, ReactNode } from "react";
import styles from "./composer.module.css";

export type ComposerSubmitMode = "send" | "steer" | "followUp";

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (text: string, mode: ComposerSubmitMode) => void | Promise<void>;
  onAbort?: () => void | Promise<void>;
  running: boolean;
  pending?: boolean;
  disabled?: boolean;
  error?: string | null;
  placeholder?: string;
  submitLabel?: string;
  controls?: ReactNode;
  hint?: string;
}

const IDLE_HINT = "Enter to send · Shift+Enter newline";
const RUNNING_HINT = "Enter to queue · Ctrl+Enter to steer · Shift+Enter newline";

export function Composer({
  value,
  onChange,
  onSubmit,
  onAbort,
  running,
  pending = false,
  disabled = false,
  error = null,
  placeholder = "Message omp…",
  submitLabel,
  controls,
  hint,
}: ComposerProps): JSX.Element {
  const blocked = disabled || pending;
  const empty = value.trim().length === 0;
  const abort = onAbort;
  const handleAbort = () => {
    if (abort) void abort();
  };

  const submit = (mode: ComposerSubmitMode) => {
    const text = value.trim();
    if (!text || blocked) return;
    void onSubmit(text, mode);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (running) {
      submit(event.ctrlKey || event.metaKey ? "steer" : "followUp");
    } else {
      submit("send");
    }
  };

  return (
    <div className={styles.composer}>
      {controls ? <div className={styles.controls}>{controls}</div> : null}
      <textarea
        className={styles.input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={3}
        spellCheck={false}
        aria-label="Message"
        disabled={disabled}
      />
      <div className={styles.bar}>
        <span className={styles.hint}>{hint ?? (running ? RUNNING_HINT : IDLE_HINT)}</span>
        <div className={styles.actions}>
          {running ? (
            <>
              {abort ? (
                <button
                  type="button"
                  className={styles.abort}
                  onClick={handleAbort}
                  aria-label="Stop"
                  disabled={disabled}
                >
                  Stop
                </button>
              ) : null}
              <button
                type="button"
                className={styles.secondary}
                onClick={() => submit("steer")}
                aria-label="Steer"
                disabled={blocked || empty}
              >
                Steer
              </button>
              <button
                type="button"
                className={styles.primary}
                onClick={() => submit("followUp")}
                aria-label="Queue"
                disabled={blocked || empty}
              >
                Queue
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.primary}
              onClick={() => submit("send")}
              aria-label={submitLabel ?? "Send"}
              disabled={blocked || empty}
            >
              {submitLabel ?? "Send"}
            </button>
          )}
        </div>
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
