import { defineConfig } from "@playwright/test";

/**
 * E2E runs against an isolated API server (port 30179) and a Vite dev server
 * (port 5174) whose proxy is pointed at that API. The API script swaps
 * OMP_WEB_OMP_BIN for `e2e/fake-omp.ts`, so no real omp install, model or
 * credentials are involved.
 *
 * Serial on purpose: both servers and the fixture workspace are shared, and
 * the git spec commits changes the file spec can leave behind.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5174",
    browserName: "chromium",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "bun e2e/start-api.ts",
      url: "http://127.0.0.1:30179/api/agent/sessions",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "bun run dev -- --port 5174 --strictPort",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
      timeout: 120_000,
      env: { OMP_WEB_API_TARGET: "http://127.0.0.1:30179" },
    },
  ],
});
