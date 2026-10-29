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

export function setupMonaco(): typeof monaco {
  if (!themeReady) {
    monaco.editor.defineTheme("omp-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#0d0f12",
        "editor.foreground": "#d7dce3",
        "editorLineNumber.foreground": "#4b5563",
        "editorLineNumber.activeForeground": "#9aa4b2",
        "editor.selectionBackground": "#2b3a55",
        "editor.lineHighlightBackground": "#14171c",
        "editorGutter.background": "#0d0f12",
        "diffEditor.insertedTextBackground": "#9ece6a22",
        "diffEditor.removedTextBackground": "#f7768e22",
        "diffEditor.insertedLineBackground": "#9ece6a14",
        "diffEditor.removedLineBackground": "#f7768e14",
      },
    });
    monaco.editor.setTheme("omp-dark");
    themeReady = true;
  }
  return monaco;
}

export { monaco };
