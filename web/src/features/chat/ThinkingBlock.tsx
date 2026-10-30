import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { fetchThinking } from "@/api/agent";
import { MarkdownBody } from "./MarkdownBody";
import { joinClassNames } from "./transcript";
import styles from "./transcript.module.css";

export interface ThinkingBlockProps {
  text: string;
  /** Saved history may omit large thinking blocks until requested. */
  deferred?: boolean;
  sessionId?: string | null;
  entryId?: string | null;
  blockIndex?: number;
  streaming?: boolean;
}

/**
 * Collapsible thinking content. Deferred blocks are fetched on first open via
 * `fetchThinking`; loading, error, and empty states stay inside the block.
 */
export function ThinkingBlock({
  text,
  deferred = false,
  sessionId = null,
  entryId = null,
  blockIndex,
  streaming = false,
}: ThinkingBlockProps): JSX.Element {
  const [loaded, setLoaded] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(false);
  const cancelled = useRef(false);

  useEffect(() => {
    // A reused row (same index after navigation) must not keep another
    // message's loaded thinking or a stale in-flight request.
    cancelled.current = false;
    requested.current = false;
    setLoaded(null);
    setError(null);
    setLoading(false);
    return () => {
      cancelled.current = true;
    };
  }, [sessionId, entryId, blockIndex]);

  const body = loaded ?? text;

  const load = () => {
    if (!deferred || requested.current) return;
    requested.current = true;
    if (body.trim() !== "") return;
    if (sessionId === null || entryId === null || typeof blockIndex !== "number") {
      setError("Thinking is no longer available.");
      return;
    }
    setLoading(true);
    setError(null);
    fetchThinking(sessionId, entryId, blockIndex).then(
      (value) => {
        if (cancelled.current) return;
        setLoaded(value);
        setLoading(false);
      },
      (reason: unknown) => {
        if (cancelled.current) return;
        setError(reason instanceof Error ? reason.message : "Failed to load thinking.");
        setLoading(false);
      },
    );
  };

  return (
    <details className={styles.thinking}>
      <summary
        className={styles.thinkingSummary}
        onClick={() => {
          load();
        }}
      >
        <span>Thinking</span>
        {streaming && body.trim() === "" ? (
          <span className={styles.thinkingLoading}>streaming…</span>
        ) : null}
      </summary>
      <div className={styles.thinkingBody}>
        {loading ? <p className={styles.thinkingLoading}>Loading thinking…</p> : null}
        {error !== null ? <p className={styles.thinkingError}>{error}</p> : null}
        {!loading && error === null && body.trim() !== "" ? (
          <MarkdownBody text={body} className={styles.thinkingMarkdown} />
        ) : null}
        {!loading && error === null && body.trim() === "" ? (
          <p className={joinClassNames(styles.muted, styles.thinkingEmpty)}>No thinking content.</p>
        ) : null}
      </div>
    </details>
  );
}
