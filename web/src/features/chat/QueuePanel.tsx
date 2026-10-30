import type { JSX } from "react";
import styles from "./queue-panel.module.css";

export interface QueuePanelProps {
  queue: { steering: string[]; followUp: string[] };
  pending?: boolean;
  onRemove: (queue: "steering" | "followUp", text: string) => void | Promise<void>;
  onPromote: (text: string) => void | Promise<void>;
}

export function QueuePanel({
  queue,
  pending = false,
  onRemove,
  onPromote,
}: QueuePanelProps): JSX.Element | null {
  const total = queue.steering.length + queue.followUp.length;
  if (total === 0) return null;

  return (
    <section className={styles.panel} aria-label="Queued messages">
      <header className={styles.header}>Queue ({total})</header>
      {queue.steering.length > 0 ? (
        <div className={styles.group}>
          <span className={styles.groupLabel}>Steering</span>
          <ul className={styles.list}>
            {queue.steering.map((text, index) => (
              <li key={`steering-${index}`} className={styles.row}>
                <span className={styles.text}>{text}</span>
                <button
                  type="button"
                  className={styles.remove}
                  onClick={() => void onRemove("steering", text)}
                  aria-label={`Remove ${text}`}
                  disabled={pending}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {queue.followUp.length > 0 ? (
        <div className={styles.group}>
          <span className={styles.groupLabel}>Follow-up</span>
          <ul className={styles.list}>
            {queue.followUp.map((text, index) => (
              <li key={`followUp-${index}`} className={styles.row}>
                <span className={styles.text}>{text}</span>
                <button
                  type="button"
                  className={styles.promote}
                  onClick={() => void onPromote(text)}
                  aria-label={`Steer ${text}`}
                  disabled={pending}
                >
                  Steer
                </button>
                <button
                  type="button"
                  className={styles.remove}
                  onClick={() => void onRemove("followUp", text)}
                  aria-label={`Remove ${text}`}
                  disabled={pending}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
