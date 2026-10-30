import { useCallback, useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { browseCwd } from "@/api/agent";
import type { CwdListing } from "@/api/agent";
import styles from "./new-session.module.css";

export interface CwdPickerProps {
  value: string;
  onChange: (path: string) => void;
  disabled?: boolean;
}

export function CwdPicker({ value, onChange, disabled = false }: CwdPickerProps): JSX.Element {
  const [listing, setListing] = useState<CwdListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async (target: string | undefined) => {
    const request = requestRef.current + 1;
    requestRef.current = request;
    setLoading(true);
    setError(null);
    try {
      const next = await browseCwd(target);
      if (requestRef.current !== request) return;
      setListing(next);
      setLoading(false);
    } catch (cause) {
      if (requestRef.current !== request) return;
      setListing(null);
      setError(cause instanceof Error ? cause.message : "Unable to browse this folder");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(value.trim() === "" ? undefined : value);
  }, [load, value]);

  const busy = disabled || loading;
  const parentPath = listing?.parentPath ?? null;
  const drives = listing?.drives ?? [];
  const directories = listing?.directories ?? [];
  const shownPath = listing?.path ?? value;
  const empty = listing !== null && parentPath === null && drives.length === 0 && directories.length === 0;

  return (
    <section className={styles.picker} aria-label="Workspace folder browser">
      <div className={styles.pickerPath} title={shownPath}>
        {loading && listing === null ? "Loading…" : shownPath || "Select a folder"}
      </div>
      {error !== null ? (
        <p className={styles.pickerError} role="alert">
          {error}
        </p>
      ) : null}
      <ul className={styles.pickerList}>
        {parentPath !== null ? (
          <li>
            <button
              type="button"
              className={styles.pickerRow}
              onClick={() => void load(parentPath)}
              disabled={busy}
              title={parentPath}
            >
              <span className={styles.pickerName}>..</span>
              <span className={styles.pickerKind}>parent</span>
            </button>
          </li>
        ) : null}
        {drives.map((drive) => (
          <li key={`drive:${drive.path}`}>
            <button
              type="button"
              className={styles.pickerRow}
              onClick={() => void load(drive.path)}
              disabled={busy}
              title={drive.path}
            >
              <span className={styles.pickerName}>{drive.name}</span>
              <span className={styles.pickerKind}>drive</span>
            </button>
          </li>
        ))}
        {directories.map((directory) => (
          <li key={directory.path}>
            <button
              type="button"
              className={styles.pickerRow}
              onClick={() => void load(directory.path)}
              disabled={busy}
              title={directory.path}
            >
              <span className={styles.pickerName}>{directory.name}</span>
            </button>
          </li>
        ))}
        {empty && !loading && error === null ? (
          <li className={styles.pickerEmpty}>No subdirectories</li>
        ) : null}
      </ul>
      <div className={styles.pickerFooter}>
        <button
          type="button"
          className={styles.primary}
          onClick={() => {
            if (listing !== null) onChange(listing.path);
          }}
          disabled={busy || listing === null}
        >
          Use this folder
        </button>
      </div>
    </section>
  );
}
