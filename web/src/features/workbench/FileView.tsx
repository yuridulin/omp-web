import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { changeLspDocument, fetchLspDiagnostics, openLspDocument } from "@/api/lsp";
import { writeWorkspaceFile } from "@/api/workspace";
import { fileTabId } from "@/layout/layout-store";
import { setLspDiagnostics, useLspDiagnostics } from "@/state/lsp-store";
import { buildInlinePrompt, inlineSelectionError, type InlineSelection } from "./inline-edit";
import { InlineEditBar } from "./InlineEditBar";
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
  root: string | null;
  position?: { line: number; column: number };
  scrollTop?: number;
  onScroll: (scrollTop: number) => void;
  onInlinePrompt?: (text: string) => Promise<void>;
}

export function FileView({
  path,
  sessionId,
  root,
  position,
  scrollTop,
  onScroll,
  onInlinePrompt,
}: FileViewProps) {
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
  const [lspNotice, setLspNotice] = useState<string | null>(null);
  const [inlineSelection, setInlineSelection] = useState<InlineSelection | null>(null);
  const [inlineInstruction, setInlineInstruction] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [inlineBusy, setInlineBusy] = useState(false);
  const lspOpenRef = useRef(false);
  const lspTextRef = useRef("");
  const contentRef = useRef(content);
  const openKeyRef = useRef<string | null>(null);
  contentRef.current = content;

  const serverContent = query.data?.content;
  const language = query.data?.language;
  const lsp = useLspDiagnostics(root, path);

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

  // Open the document once per (root, path, language). The server keeps it open
  // until the layout store sees the tab disappear, so FileView unmounts are
  // harmless.
  useEffect(() => {
    if (!root || !language || query.data === undefined) return;
    const key = `${root}\0${path}\0${language}`;
    if (openKeyRef.current === key) return;
    openKeyRef.current = key;
    lspOpenRef.current = false;
    lspTextRef.current = "";
    const isCurrent = () => openKeyRef.current === key;
    const text = getEditorDraft(tabId)?.content ?? query.data.content;

    void openLspDocument({ root, path, languageId: language, text })
      .then(async (result) => {
        if (!isCurrent()) return;
        if (!result.ok) {
          // Let a later refetch or root change retry the open.
          openKeyRef.current = null;
          if (result.reason === "missing_server" || result.reason === "server_failed") {
            const detail = result.error ?? result.hint;
            setLspNotice(`LSP: ${result.reason}${detail ? ` — ${detail}` : ""}`);
          }
          return;
        }
        lspOpenRef.current = true;
        lspTextRef.current = text;
        setLspNotice(null);
        try {
          const snapshot = await fetchLspDiagnostics(root, path);
          if (isCurrent()) {
            setLspDiagnostics(root, path, snapshot.diagnostics, snapshot.version, snapshot.server);
          }
        } catch {
          // The SSE stream still delivers later publishes.
        }
        if (isCurrent() && contentRef.current !== text) {
          void changeLspDocument({ root, path, text: contentRef.current }).catch(() => {});
          lspTextRef.current = contentRef.current;
        }
      })
      .catch((error: unknown) => {
        if (!isCurrent()) return;
        openKeyRef.current = null;
        setLspNotice(`LSP: ${error instanceof Error ? error.message : String(error)}`);
      });
  }, [root, path, language, query.data, tabId]);

  // Full-text sync after typing pauses; the server expects the whole document.
  useEffect(() => {
    if (!root || !lspOpenRef.current || content === lspTextRef.current) return;
    const text = content;
    const timer = setTimeout(() => {
      void changeLspDocument({ root, path, text })
        .then((result) => {
          if (result.ok) lspTextRef.current = text;
        })
        .catch(() => {
          // Reopening the tab retries from a clean document.
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [content, root, path]);

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

  const cancelInline = () => {
    setInlineSelection(null);
    setInlineInstruction("");
    setInlineError(null);
  };

  const submitInline = async () => {
    if (!inlineSelection) return;
    const error = inlineSelectionError(inlineSelection, inlineInstruction);
    if (error) {
      setInlineError(error);
      return;
    }
    if (!onInlinePrompt) {
      setInlineError("Select a session first.");
      return;
    }
    setInlineBusy(true);
    setInlineError(null);
    try {
      await onInlinePrompt(buildInlinePrompt({
        path,
        language: language ?? "plaintext",
        selection: inlineSelection,
        instruction: inlineInstruction,
      }));
      setInlineSelection(null);
      setInlineInstruction("");
    } catch (cause) {
      setInlineError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setInlineBusy(false);
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
        {lspNotice ? <span className={styles.lspNotice} title={lspNotice}>{lspNotice}</span> : null}
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
      {inlineSelection ? (
        <InlineEditBar
          instruction={inlineInstruction}
          busy={inlineBusy}
          error={inlineError}
          onChange={(value) => {
            setInlineInstruction(value);
            setInlineError(null);
          }}
          onSubmit={() => void submitInline()}
          onCancel={cancelInline}
        />
      ) : null}
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
            {...(position ? { initialPosition: position } : {})}
            {...(lsp ? { diagnostics: lsp.diagnostics } : {})}
            onScroll={onScroll}
            onChange={handleChange}
            onSave={() => void handleSave()}
            onInlineEdit={(selection) => {
              setInlineSelection(selection);
              setInlineInstruction("");
              setInlineError(null);
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}
