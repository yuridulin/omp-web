import type { JSX } from "react";
import Markdown, { type Components, type UrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { joinClassNames } from "./transcript";
import styles from "./transcript.module.css";

/**
 * Only http(s), mailto, fragments, and relative URLs survive. Anything with
 * another scheme (javascript:, data:, file:, …) is dropped.
 */
export function safeMarkdownUrl(url: string): string {
  const value = url.trim();
  if (value === "") return "";
  if (value.startsWith("#") || value.startsWith("?")) return value;
  if (value.startsWith("/")) return value.startsWith("//") ? "" : value;
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(value);
  if (!match) return value;
  const protocol = (match[1] ?? "").toLowerCase();
  return protocol === "http" || protocol === "https" || protocol === "mailto" ? value : "";
}

const urlTransform: UrlTransform = (url) => safeMarkdownUrl(url);

const components: Components = {
  a({ href, title, children }) {
    return (
      <a href={href} title={title} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  },
  pre({ children }) {
    return <pre className={styles.codeBlock}>{children}</pre>;
  },
  img({ src, alt, title }) {
    return (
      <img
        className={styles.image}
        src={src}
        alt={alt ?? ""}
        title={title}
        loading="lazy"
      />
    );
  },
};

export interface MarkdownBodyProps {
  text: string;
  className?: string | undefined;
}

/** Markdown renderer used by transcript messages. Raw HTML is never injected. */
export function MarkdownBody({ text, className }: MarkdownBodyProps): JSX.Element | null {
  if (text.trim() === "") return null;
  return (
    <div className={joinClassNames(styles.markdown, className)}>
      <Markdown remarkPlugins={[remarkGfm]} urlTransform={urlTransform} components={components}>
        {text}
      </Markdown>
    </div>
  );
}
