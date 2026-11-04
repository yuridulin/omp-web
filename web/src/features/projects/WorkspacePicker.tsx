import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { fetchDirectoryListing, type DirectoryListing } from "@/api/workspace";
import styles from "./workspace-picker.module.css";

export interface WorkspacePickerProps {
  /** Registers the chosen directory. The caller closes the picker once it resolves. */
  onChoose: (path: string) => Promise<void>;
  onClose: () => void;
  /** Shown above the list, e.g. why the native dialog did not open. */
  notice?: string;
}

/**
 * Folder picker over the server's own filesystem. Fallback for hosts that
 * cannot show a native dialog (a headless server, a remote machine); the
 * primary path is `POST /api/workspace/cwd/pick`.
 */
export function WorkspacePicker({ onChoose, onClose, notice }: WorkspacePickerProps): JSX.Element {
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [pathInput, setPathInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const open = useCallback((directory?: string) => {
    const id = ++request.current;
    setLoading(true);
    setError(null);
    void fetchDirectoryListing(directory)
      .then((next) => {
        if (id !== request.current) return;
        setListing(next);
        setPathInput(next.path);
      })
      .catch((cause: unknown) => {
        if (id !== request.current) return;
        setError(cause instanceof Error ? cause.message : "Unable to list this folder");
      })
      .finally(() => {
        if (id === request.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    open();
  }, [open]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [listing?.path]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const choose = (path: string) => {
    if (busy || path === "") return;
    setBusy(true);
    setError(null);
    void onChoose(path)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Unable to add this folder");
      })
      .finally(() => setBusy(false));
  };

  const entries = listing?.drives ?? listing?.directories ?? [];
  const canChoose = !busy && !loading && listing !== null && listing.path !== "";

  return (
    <div className={styles.backdrop} onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className={styles.panel} role="dialog" aria-label="Add workspace folder">
        <header className={styles.header}>
          <h2 className={styles.title}>Add workspace</h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            title="Close workspace picker"
            aria-label="Close workspace picker"
          >
            ×
          </button>
        </header>

        <div className={styles.pathRow}>
          <button
            type="button"
            className={styles.up}
            onClick={() => {
              if (listing?.parentPath) open(listing.parentPath);
            }}
            disabled={!listing?.parentPath}
            title="Parent folder"
            aria-label="Parent folder"
          >
            ↑
          </button>
          <input
            ref={inputRef}
            className={styles.path}
            value={pathInput}
            onChange={(event) => setPathInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") open(pathInput.trim() || undefined);
            }}
            placeholder="Type an absolute path and press Enter"
            aria-label="Folder path"
            spellCheck={false}
          />
        </div>

        {notice ? <p className={styles.notice}>{notice}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.list}>
          {loading && !listing ? <p className={styles.note}>Loading folders…</p> : null}
          {!loading && entries.length === 0 ? (
            <p className={styles.note}>{listing?.drives ? "No drives" : "No subfolders"}</p>
          ) : null}
          {entries.map((entry) => (
            <button
              key={entry.path}
              type="button"
              className={styles.entry}
              onClick={() => open(entry.path)}
              title={entry.path}
            >
              <span className={styles.entryName}>{listing?.drives ? entry.name : `${entry.name}/`}</span>
            </button>
          ))}
        </div>

        <footer className={styles.footer}>
          <span className={styles.selected} title={listing?.path}>
            {listing?.path || "Pick a drive"}
          </span>
          <button
            type="button"
            className={styles.choose}
            onClick={() => {
              if (listing) choose(listing.path);
            }}
            disabled={!canChoose}
            title="Add this folder as a workspace"
          >
            {busy ? "Adding…" : "Add folder"}
          </button>
        </footer>
      </div>
    </div>
  );
}
