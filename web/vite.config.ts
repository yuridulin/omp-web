import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Monaco's package exports only expose JS subpaths; the editor CSS is
      // still shipped in the package and must be pulled in explicitly.
      "monaco-editor/min/vs/editor/editor.main.css": fileURLToPath(
        new URL("./node_modules/monaco-editor/min/vs/editor/editor.main.css", import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // The Bun server owns HTTP and SSE; the UI never imports its code.
      "/api": {
        target: process.env.OMP_WEB_API_TARGET ?? "http://127.0.0.1:30178",
        changeOrigin: false,
        ws: true,
      },
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
  test: {
    environment: "happy-dom",
    restoreMocks: true,
    // Playwright specs live under e2e/; Vitest must not collect them.
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
