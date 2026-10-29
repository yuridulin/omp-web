import { lazy, Suspense } from "react";
import { useFileContent } from "./use-workbench-data";
import styles from "./workbench.module.css";

const CodeEditor = lazy(() => import("@/editor/CodeEditor").then((module) => ({ default: module.CodeEditor })));

interface FileViewProps {
  path: string;
  sessionId: string;
  scrollTop?: number;
  onScroll: (scrollTop: number) => void;
}

export function FileView({ path, sessionId, scrollTop, onScroll }: FileViewProps) {
  const query = useFileContent(path, sessionId);
  if (query.isLoading) return <div className={styles.editorStatus}>Loading {path}…</div>;
  if (query.isError) return <div className={styles.editorError}>{query.error.message}</div>;
  if (!query.data) return null;
  return (
    <Suspense fallback={<div className={styles.editorStatus}>Loading editor…</div>}>
      <CodeEditor
        value={query.data.content}
        language={query.data.language}
        {...(scrollTop !== undefined ? { initialScrollTop: scrollTop } : {})}
        onScroll={onScroll}
      />
    </Suspense>
  );
}
