import { useEffect, useRef } from "react";
import type * as Monaco from "monaco-editor";
import { setupMonaco } from "./monaco";
import styles from "./editor.module.css";

interface CodeEditorProps {
  value: string;
  language: string;
  initialScrollTop?: number;
  onScroll?: (scrollTop: number) => void;
}

export function CodeEditor({ value, language, initialScrollTop, onScroll }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const scrollRef = useRef(onScroll);
  scrollRef.current = onScroll;

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const monaco = setupMonaco();
    const editor = monaco.editor.create(node, {
      value,
      language,
      theme: "omp-dark",
      readOnly: true,
      domReadOnly: true,
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
    const subscription = editor.onDidScrollChange((event) => scrollRef.current?.(event.scrollTop));
    return () => {
      subscription.dispose();
      const model = editor.getModel();
      editorRef.current = null;
      editor.dispose();
      model?.dispose();
    };
    // The editor is created once; value/language updates use the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!model) return;
    if (model.getValue() !== value) model.setValue(value);
    setupMonaco().editor.setModelLanguage(model, language);
  }, [value, language]);

  return <div ref={host} className={styles.host} />;
}
