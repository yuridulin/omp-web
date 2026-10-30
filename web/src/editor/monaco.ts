import * as monaco from "monaco-editor";
// Relative worker paths: Monaco's exports map does not expose `?worker`
// subpaths, and Vite resolves these through the workspace dependency.
import "monaco-editor/min/vs/editor/editor.main.css";
import EditorWorker from "../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker";
import JsonWorker from "../../node_modules/monaco-editor/esm/vs/language/json/json.worker.js?worker";
import CssWorker from "../../node_modules/monaco-editor/esm/vs/language/css/css.worker.js?worker";
import HtmlWorker from "../../node_modules/monaco-editor/esm/vs/language/html/html.worker.js?worker";
import TsWorker from "../../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js?worker";

interface MonacoEnvironment {
  getWorker(workerId: string, label: string): Worker;
}

(self as unknown as { MonacoEnvironment: MonacoEnvironment }).MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === "json") return new JsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new CssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new HtmlWorker();
    if (label === "typescript" || label === "javascript") return new TsWorker();
    return new EditorWorker();
  },
};

let themeReady = false;

export function monacoTheme(mode: "light" | "dark"): "omp-light" | "omp-dark" {
  return mode === "dark" ? "omp-dark" : "omp-light";
}

export function setupMonaco(mode?: "light" | "dark"): typeof monaco {
  if (!themeReady) {
    monaco.editor.defineTheme("omp-light", {
      base: "vs",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#ffffff",
        "editor.foreground": "#1f2328",
        "editorLineNumber.foreground": "#8c959f",
        "editorLineNumber.activeForeground": "#1f2328",
        "editor.selectionBackground": "#b6d7ff",
        "editor.lineHighlightBackground": "#f6f8fa",
        "editorGutter.background": "#ffffff",
        "diffEditor.insertedTextBackground": "#1a7f3722",
        "diffEditor.removedTextBackground": "#cf222e22",
        "diffEditor.insertedLineBackground": "#1a7f3714",
        "diffEditor.removedLineBackground": "#cf222e14",
      },
    });
    monaco.editor.defineTheme("omp-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#111214",
        "editor.foreground": "#e6e7ea",
        "editorLineNumber.foreground": "#6e7681",
        "editorLineNumber.activeForeground": "#c9d1d9",
        "editor.selectionBackground": "#2b3a55",
        "editor.lineHighlightBackground": "#17181b",
        "editorGutter.background": "#111214",
        "diffEditor.insertedTextBackground": "#4ac26b22",
        "diffEditor.removedTextBackground": "#f8514922",
        "diffEditor.insertedLineBackground": "#4ac26b14",
        "diffEditor.removedLineBackground": "#f8514914",
      },
    });
    themeReady = true;
  }
  if (mode) monaco.editor.setTheme(monacoTheme(mode));
  return monaco;
}

export { monaco };
