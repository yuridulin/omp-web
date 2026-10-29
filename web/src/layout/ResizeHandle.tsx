import { useRef } from "react";
import styles from "./resize-handle.module.css";

interface ResizeHandleProps {
  label: string;
  onDelta: (delta: number) => void;
  onReset?: () => void;
}

export function ResizeHandle({ label, onDelta, onReset }: ResizeHandleProps) {
  const lastX = useRef<number | null>(null);

  const release = (event: React.PointerEvent<HTMLDivElement>) => {
    lastX.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      className={styles.handle}
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        lastX.current = event.clientX;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (lastX.current === null) return;
        const delta = event.clientX - lastX.current;
        if (delta === 0) return;
        lastX.current = event.clientX;
        onDelta(delta);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onDelta(-8);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          onDelta(8);
        }
      }}
    />
  );
}
