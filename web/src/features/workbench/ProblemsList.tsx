import { relativePath } from "@/api/paths";
import type { LspDocumentState } from "@/state/lsp-store";
import styles from "./problems-list.module.css";

const SEVERITY_LABEL: Record<number, string> = { 1: "E", 2: "W", 3: "I", 4: "H" };

interface ProblemsListProps {
  documents: readonly LspDocumentState[];
  onOpen: (path: string, line: number) => void;
}

export function ProblemsList({ documents: all, onOpen }: ProblemsListProps) {
  const documents = all.filter((document) => document.diagnostics.length > 0);
  const total = documents.reduce((sum, document) => sum + document.diagnostics.length, 0);

  if (total === 0) {
    return <p className={styles.empty}>No problems.</p>;
  }

  return (
    <div className={styles.list}>
      {documents.map((document) => (
        <section key={document.path} className={styles.file}>
          <div className={styles.fileHeader} title={document.path}>
            <span className={styles.fileName}>{relativePath(document.path, document.root)}</span>
            <span className={styles.fileCount}>{document.diagnostics.length}</span>
          </div>
          {document.diagnostics.map((diagnostic, index) => (
            <button
              key={`${document.path}:${diagnostic.range.start.line}:${diagnostic.range.start.character}:${index}`}
              className={styles.row}
              title={diagnostic.message}
              onClick={() => onOpen(document.path, diagnostic.range.start.line + 1)}
            >
              <span className={`${styles.severity} ${styles[`severity${diagnostic.severity ?? 2}`] ?? ""}`}>
                {SEVERITY_LABEL[diagnostic.severity ?? 2] ?? "W"}
              </span>
              <span className={styles.line}>{diagnostic.range.start.line + 1}</span>
              <span className={styles.message}>{diagnostic.message}</span>
              {diagnostic.source ? <span className={styles.source}>{diagnostic.source}</span> : null}
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}
