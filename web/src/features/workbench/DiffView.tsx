import { lazy, Suspense } from "react";
import type { DiffTabSource } from "@/layout/layout-store";
import { useGitFile } from "./use-workbench-data";
import styles from "./diff-view.module.css";

const DiffEditor = lazy(() => import("@/editor/DiffEditor").then((module) => ({ default: module.DiffEditor })));

interface DiffViewProps {
  source: DiffTabSource;
}

export function DiffView({ source }: DiffViewProps) {
  const query = useGitFile(source);
  if (query.isLoading) return <div className={styles.status}>Loading diff…</div>;
  if (query.isError) return <div className={styles.error}>{query.error.message}</div>;
  const data = query.data;
  if (!data) return null;
  if (!data.supported) {
    const reason = data.binary
      ? "Binary file — no text diff."
      : data.truncated
        ? "File is too large for a text diff."
        : "No textual diff available for this file.";
    return <div className={styles.status}>{reason}</div>;
  }
  return (
    <Suspense fallback={<div className={styles.status}>Loading diff…</div>}>
      <DiffEditor
        original={data.before ?? ""}
        modified={data.after ?? ""}
        language={data.language ?? "text"}
      />
    </Suspense>
  );
}
