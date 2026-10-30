import { useEffect, useRef } from "react";
import type * as Monaco from "monaco-editor";
import { setupMonaco } from "./monaco";
import styles from "./editor.module.css";

interface CodeEditorProps {
  value: string;
  language: string;
  readOnly?: boolean;
  initialScrollTop?: number;
  onScroll?: (scrollTop: number) => void;
  onChange?: (value: string) => void;
  onSave?: () => void;
}

export function CodeEditor({
  value,
  language,
  readOnly = false,
  initialScrollTop,
  onScroll,
  onChange,
  onSave,
}: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const scrollRef = useRef(onScroll);
  const changeRef = useRef(onChange);
  const saveRef = useRef(onSave);
  /**
   * `model.setValue` fires `onDidChangeModelContent` synchronously. Parent-driven
   * updates must never surface as user edits, so the listener bails while this is set.
   */
  const applyingRef = useRef(false);
  scrollRef.current = onScroll;
  changeRef.current = onChange;
  saveRef.current = onSave;

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const monaco = setupMonaco();
    const editor = monaco.editor.create(node, {
      value,
      language,
      theme: "omp-dark",
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

  return <div ref={host} className={styles.host} />;
}
