import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type JSX,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { QueueIcon, SendIcon, SteerIcon, StopIcon } from "./icons";
import type { ComposerSubmitMode } from "@/slots/chat";
import type { ComposerImage } from "@/state/composer-store";
import type { ComposerClasses } from "./classes";
import { clipboardImageFiles, preparePastedImages } from "./image-attachments";

export type { ComposerSubmitMode };

export interface ComposerProps {
  value: string;
  classes: ComposerClasses;
  images?: readonly ComposerImage[];
  onChange: (value: string) => void;
  onSubmit: (
    text: string,
    mode: ComposerSubmitMode,
    images: readonly ComposerImage[],
  ) => void | Promise<void>;
  onAddImages?: (images: ComposerImage[]) => void;
  onRemoveImage?: (id: string) => void;
  onAbort?: () => void | Promise<void>;
  running: boolean;
  pending?: boolean;
  dropActive?: boolean;
  disabled?: boolean;
  error?: string | null;
  placeholder?: string;
  submitLabel?: string;
  controls?: ReactNode;
  status?: ReactNode;
  hint?: string;
}

const IDLE_HINT = "Enter to send · Shift+Enter newline";
const RUNNING_HINT = "Enter to queue · Ctrl+Enter to steer · Shift+Enter newline";

export function Composer({
  value,
  classes,
  images = [],
  onChange,
  onSubmit,
  onAddImages,
  onRemoveImage,
  onAbort,
  running,
  pending = false,
  dropActive = false,
  disabled = false,
  error = null,
  placeholder = "Message or run a task, / commands, @ files…",
  submitLabel,
  controls,
  status,
  hint,
}: ComposerProps): JSX.Element {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const blocked = disabled || pending;
  const empty = value.trim().length === 0 && images.length === 0;
  const visibleError = pasteError ?? error;
  const defaultHint = status ? undefined : running ? RUNNING_HINT : IDLE_HINT;
  const visibleHint = hint ?? defaultHint;
  const abort = onAbort;
  const handleAbort = () => {
    if (abort) void abort();
  };

  useEffect(() => {
    const node = inputRef.current;
    if (!node) return;
    node.style.height = "auto";
    const max = typeof window === "undefined" ? 320 : Math.max(120, window.innerHeight * 0.4);
    const next = Math.min(node.scrollHeight, max);
    node.style.height = next > 0 ? `${next}px` : "";
    node.style.overflowY = node.scrollHeight > max ? "auto" : "hidden";
  }, [value]);

  const submit = (mode: ComposerSubmitMode) => {
    const text = value.trim();
    if ((text === "" && images.length === 0) || blocked) return;
    void onSubmit(text, mode, images);
  };

  const handleChange = (next: string) => {
    setPasteError(null);
    onChange(next);
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onAddImages || blocked) return;
    const files = clipboardImageFiles(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    setPasteError(null);
    void preparePastedImages(files, images).then(({ images: prepared, error: nextError }) => {
      if (nextError) {
        setPasteError(nextError);
        return;
      }
      if (prepared.length > 0) onAddImages(prepared);
    });
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
    <div className={classes.wrap}>
      <div className={dropActive ? `${classes.composer} ${classes.composerDrop}` : classes.composer}>
        {images.length > 0 ? (
          <ul className={classes.attachments} aria-label="Attached images">
            {images.map((image, index) => (
              <li key={image.id} className={classes.attachment}>
                <img
                  className={classes.attachmentImage}
                  src={`data:${image.mimeType};base64,${image.data}`}
                  alt={`Attached image ${index + 1}`}
                />
                {onRemoveImage ? (
                  <button
                    type="button"
                    className={classes.attachmentRemove}
                    onClick={() => onRemoveImage(image.id)}
                    aria-label={`Remove image ${index + 1}`}
                    title="Remove image"
                  >
                    ×
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <textarea
          ref={inputRef}
          className={classes.input}
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          rows={1}
          spellCheck={false}
          aria-label="Message"
          disabled={disabled}
        />
        <div className={classes.footer}>
          <div className={classes.controls}>
            {controls}
          </div>
          <div className={classes.actions}>
            {running ? (
              <>
                {abort ? (
                  <button
                    type="button"
                    className={classes.stop}
                    onClick={handleAbort}
                    aria-label="Stop"
                    title="Stop"
                    disabled={disabled}
                  >
                    <StopIcon size={14} />
                  </button>
                ) : null}
                <button
                  type="button"
                  className={classes.ghost}
                  onClick={() => submit("steer")}
                  aria-label="Steer"
                  title="Steer (Ctrl+Enter)"
                  disabled={blocked || empty}
                >
                  <SteerIcon size={13} />
                  <span>Steer</span>
                </button>
                <button
                  type="button"
                  className={classes.queue}
                  onClick={() => submit("followUp")}
                  aria-label="Queue"
                  title="Queue (Enter)"
                  disabled={blocked || empty}
                >
                  <QueueIcon size={13} />
                  <span>Queue</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                className={classes.send}
                onClick={() => submit("send")}
                aria-label={submitLabel ?? "Send"}
                title={submitLabel ? submitLabel : "Send (Enter)"}
                disabled={blocked || empty}
              >
                <SendIcon size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
      {status ? <div className={classes.stats}>{status}</div> : null}
      {visibleHint ? <span className={classes.hint}>{visibleHint}</span> : null}
      {visibleError ? (
        <p className={classes.error} role="alert">
          {visibleError}
        </p>
      ) : null}
    </div>
  );
}
