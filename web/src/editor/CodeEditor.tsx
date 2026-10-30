import { useEffect, useRef } from "react";
import type * as Monaco from "monaco-editor";
import type { LspDiagnostic } from "@/api/lsp";
import type { InlineSelection } from "@/features/workbench/inline-edit";
import { useTheme } from "@/state/theme";
import { markersFromDiagnostics } from "./lsp-markers";
import { monacoTheme, setupMonaco } from "./monaco";
import styles from "./editor.module.css";

interface CodeEditorProps {
  value: string;
  language: string;
  readOnly?: boolean;
  initialScrollTop?: number;
  initialPosition?: { line: number; column: number };
  diagnostics?: LspDiagnostic[];
  onScroll?: (scrollTop: number) => void;
  onChange?: (value: string) => void;
  onSave?: () => void;
  onInlineEdit?: (selection: InlineSelection) => void;
}

export function CodeEditor({
  value,
  language,
  readOnly = false,
  initialScrollTop,
  initialPosition,
  diagnostics,
  onScroll,
  onChange,
  onSave,
  onInlineEdit,
}: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const theme = useTheme();
  const scrollRef = useRef(onScroll);
  const changeRef = useRef(onChange);
  const saveRef = useRef(onSave);
  const inlineRef = useRef(onInlineEdit);
  /**
   * `model.setValue` fires `onDidChangeModelContent` synchronously. Parent-driven
   * updates must never surface as user edits, so the listener bails while this is set.
   */
  const applyingRef = useRef(false);
  scrollRef.current = onScroll;
  changeRef.current = onChange;
  saveRef.current = onSave;
  inlineRef.current = onInlineEdit;

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const monaco = setupMonaco(theme);
    const editor = monaco.editor.create(node, {
      value,
      language,
      theme: monacoTheme(theme),
      readOnly,
      domReadOnly: readOnly,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 12,
      lineHeight: 18,
      renderLineHighlight: "all",
      padding: { top: 8 },
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
    });
    editorRef.current = editor;
    if (initialScrollTop) editor.setScrollTop(initialScrollTop);
    const scrollSubscription = editor.onDidScrollChange((event) => scrollRef.current?.(event.scrollTop));
    const changeSubscription = editor.onDidChangeModelContent(() => {
      if (applyingRef.current) return;
      changeRef.current?.(editor.getValue());
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current?.());
    editor.addAction({
      id: "omp.inlineEdit",
      label: "Inline edit with omp",
      keybindings: [
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK,
        monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyK,
      ],
      run: (current) => {
        const model = current.getModel();
        const selection = current.getSelection();
        if (!model || !selection) return;
        const range = selection.isEmpty()
          ? new monaco.Range(
              selection.startLineNumber,
              1,
              selection.startLineNumber,
              model.getLineMaxColumn(selection.startLineNumber),
            )
          : selection;
        inlineRef.current?.({
          startLine: range.startLineNumber,
          startColumn: range.startColumn,
          endLine: range.endLineNumber,
          endColumn: range.endColumn,
          text: model.getValueInRange(range),
        });
      },
    });
    return () => {
      scrollSubscription.dispose();
      changeSubscription.dispose();
      const model = editor.getModel();
      editorRef.current = null;
      editor.dispose();
      model?.dispose();
    };
    // The editor is created once; value/language/readOnly updates use the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!model) return;
    if (model.getValue() !== value) {
      applyingRef.current = true;
      try {
        model.setValue(value);
      } finally {
        applyingRef.current = false;
      }
    }
    setupMonaco().editor.setModelLanguage(model, language);
  }, [value, language]);

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly, domReadOnly: readOnly });
  }, [readOnly]);

  useEffect(() => {
    if (editorRef.current) setupMonaco(theme);
  }, [theme]);

  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) return;
    setupMonaco().editor.setModelMarkers(
      model,
      "omp-lsp",
      markersFromDiagnostics(diagnostics ?? []) as Monaco.editor.IMarkerData[],
    );
  }, [diagnostics]);

  useEffect(() => {
    if (!initialPosition) return;
    const editor = editorRef.current;
    if (!editor) return;
    const position = { lineNumber: initialPosition.line, column: initialPosition.column };
    editor.setPosition(position);
    editor.revealPositionInCenter(position);
  }, [initialPosition?.line, initialPosition?.column]);

  return <div ref={host} className={styles.host} />;
}
