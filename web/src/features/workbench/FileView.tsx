import { lazy, Suspense, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { writeWorkspaceFile } from "@/api/workspace";
import { fileTabId } from "@/layout/layout-store";
import {
  clearEditorDraft,
  getEditorDraft,
  setEditorDraft,
  useDirtyTabIds,
} from "./editor-state";
import { useFileContent } from "./use-workbench-data";
import styles from "./file-view.module.css";

const CodeEditor = lazy(() => import("@/editor/CodeEditor").then((module) => ({ default: module.CodeEditor })));

const INVALIDATED_KEYS: readonly (readonly string[])[] = [
  ["file-content"],
  ["file-list"],
  ["git-status"],
  ["git-file"],
  ["git-branches"],
];

interface FileViewProps {
  path: string;
  sessionId: string;
  scrollTop?: number;
  onScroll: (scrollTop: number) => void;
}

export function FileView({ path, sessionId, scrollTop, onScroll }: FileViewProps) {
  const tabId = fileTabId(path);
  const query = useFileContent(path, sessionId);
  const queryClient = useQueryClient();
  const dirtyTabIds = useDirtyTabIds();
  const dirty = dirtyTabIds.has(tabId);

  const [content, setContent] = useState(() => getEditorDraft(tabId)?.content ?? "");
  const [baseContent, setBaseContent] = useState(() => getEditorDraft(tabId)?.baseContent ?? "");
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const serverContent = query.data?.content;

  useEffect(() => {
    if (serverContent === undefined) return;
    const draft = getEditorDraft(tabId);
    if (draft) {
      setContent(draft.content);
      setBaseContent(draft.baseContent);
      setConflict(serverContent !== draft.baseContent);
      return;
    }
    setContent(serverContent);
    setBaseContent(serverContent);
    setConflict(false);
  }, [serverContent, tabId]);

  const handleChange = (next: string) => {
    setContent(next);
    setEditorDraft(tabId, { content: next, baseContent });
  };

  const handleSave = async () => {
    const draft = getEditorDraft(tabId);
    if (!draft || saving) return;
    const saved = draft.content;
    setSaving(true);
    setSaveError(null);
    try {
      await writeWorkspaceFile(path, saved);
      const latest = getEditorDraft(tabId);
      if (latest && latest.content !== saved) {
        // Typing continued while the write was in flight: keep the newer draft,
        // but re-base it so it is no longer reported as a conflict.
        setEditorDraft(tabId, { content: latest.content, baseContent: saved });
        setBaseContent(saved);
      } else {
        clearEditorDraft(tabId);
        setContent(saved);
        setBaseContent(saved);
      }
      setConflict(false);
      await Promise.all(
        INVALIDATED_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const reloadFromDisk = () => {
    if (serverContent === undefined) return;
    clearEditorDraft(tabId);
    setContent(serverContent);
    setBaseContent(serverContent);
    setConflict(false);
    setSaveError(null);
  };

  if (query.isLoading && !dirty) {
    return <div className={styles.status}>Loading {path}…</div>;
  }
  if (query.isError && !dirty) {
    return <div className={styles.statusError}>{query.error.message}</div>;
  }

  const errorText = saveError ?? (query.isError ? query.error.message : null);

  return (
    <div className={styles.view}>
      <div className={styles.bar}>
        <span className={dirty ? styles.dirty : styles.clean}>
          {dirty ? "● Unsaved" : "Saved"}
        </span>
        <span className={styles.path} title={path}>{path}</span>
        {errorText ? <span className={styles.error} title={errorText}>{errorText}</span> : null}
        <button
          className={styles.saveButton}
          onClick={() => void handleSave()}
          disabled={!dirty || saving}
          title="Save (Ctrl/Cmd+S)"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {conflict ? (
        <div className={styles.conflict}>
          <span className={styles.conflictText}>File changed on disk</span>
          <button className={styles.conflictAction} onClick={reloadFromDisk}>Reload</button>
          <button className={styles.conflictAction} onClick={() => setConflict(false)}>Keep editing</button>
        </div>
      ) : null}
      <div className={styles.editor}>
        <Suspense fallback={<div className={styles.status}>Loading editor…</div>}>
          <CodeEditor
            value={content}
            language={query.data?.language ?? "plaintext"}
            readOnly={false}
            {...(scrollTop !== undefined ? { initialScrollTop: scrollTop } : {})}
            onScroll={onScroll}
            onChange={handleChange}
            onSave={() => void handleSave()}
          />
        </Suspense>
      </div>
    </div>
  );
}
