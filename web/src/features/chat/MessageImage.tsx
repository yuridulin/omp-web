import type { JSX } from "react";
import { imageSrc } from "./transcript";
import styles from "./transcript.module.css";

export interface MessageImageProps {
  /** An image content block, a raw image object, or a URL string. */
  image: unknown;
  alt?: string;
}

/**
 * Renders an allowed image source. Unsupported or malformed sources degrade to
 * a textual placeholder instead of a broken <img>.
 */
export function MessageImage({ image, alt = "attached image" }: MessageImageProps): JSX.Element {
  const src = imageSrc(image);
  if (!src) {
    return (
      <span className={styles.imagePlaceholder} role="img" aria-label={`${alt} unavailable`}>
        image unavailable
      </span>
    );
  }
  return <img className={styles.image} src={src} alt={alt} loading="lazy" />;
}
