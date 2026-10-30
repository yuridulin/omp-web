import { useEffect, useRef } from "react";
import { useTheme } from "@/state/theme";
import { monacoTheme, setupMonaco } from "./monaco";
import styles from "./editor.module.css";

interface DiffEditorProps {
  original: string;
  modified: string;
  language: string;
}

export function DiffEditor({ original, modified, language }: DiffEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const theme = useTheme();

  useEffect(() => {
    setupMonaco(theme);
  }, [theme]);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const monaco = setupMonaco();
    const originalModel = monaco.editor.createModel(original, language);
    const modifiedModel = monaco.editor.createModel(modified, language);
    const editor = monaco.editor.createDiffEditor(node, {
      theme: monacoTheme(theme),
      readOnly: true,
      originalEditable: false,
      automaticLayout: true,
      renderSideBySide: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 12,
      lineHeight: 18,
      diffWordWrap: "off",
      diffAlgorithm: "legacy",
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
    });
    editor.setModel({ original: originalModel, modified: modifiedModel });
    return () => {
      editor.dispose();
      originalModel.dispose();
      modifiedModel.dispose();
    };
  }, [original, modified, language]);

  return <div ref={host} className={styles.host} />;
}
