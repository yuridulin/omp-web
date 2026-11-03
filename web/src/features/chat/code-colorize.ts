import { useEffect, useState } from "react";
import { useTheme } from "@/state/theme";

/**
 * Highlight a snippet with Monaco's standalone colorizer.
 *
 * Monaco is a heavy chunk that the chat shell must not pay for on first paint,
 * so the import is dynamic and only runs when a `<pre>` actually mounts: the
 * workbench loads the same module for the editor, and the browser reuses it.
 * Until it resolves — or if it throws — the caller keeps plain text, so a
 * snippet is never empty and never blocks a message.
 */
const htmlCache = new Map<string, string>();

export function useColorizedCode(language: string, code: string): string | null {
  const theme = useTheme();
  const key = `${theme}\u0000${language}\u0000${code}`;
  const [html, setHtml] = useState<string | null>(() => htmlCache.get(key) ?? null);

  useEffect(() => {
    const cached = htmlCache.get(key);
    if (cached !== undefined) {
      setHtml(cached);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { setupMonaco, monacoTheme } = await import("@/editor/monaco");
        const monaco = setupMonaco(theme);
        // `colorize` reads the global editor theme, which is the app theme.
        monaco.editor.setTheme(monacoTheme(theme));
        const value = await monaco.editor.colorize(code, language, { tabSize: 2 });
        htmlCache.set(key, value);
        if (!cancelled) setHtml(value);
      } catch {
        // Plain text stays: highlighting is decoration, never a dependency.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, language, code, theme]);

  return html;
}
