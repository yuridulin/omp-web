import { readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";

export interface E2EEnvironment {
  workspace: string;
  workspace2: string;
  agentDir: string;
  apiBase: string;
  webBase: string;
  ompLauncher: string;
}

const TMP_DIR = path.join(fileURLToPath(new URL(".", import.meta.url)), ".tmp");

export function readEnvironment(): E2EEnvironment {
  const raw = readFileSync(path.join(TMP_DIR, "e2e-env.json"), "utf8");
  return JSON.parse(raw) as E2EEnvironment;
}

/** Absolute path inside the fixture workspace. */
export function workspacePath(...segments: string[]): string {
  return path.join(readEnvironment().workspace, ...segments);
}

/** Absolute path inside the second fixture workspace. */
export function workspace2Path(...segments: string[]): string {
  return path.join(readEnvironment().workspace2, ...segments);
}

/** Register another allowed project, as the workbench's add-folder menu does. */
export async function registerProject(cwd: string): Promise<void> {
  const env = readEnvironment();
  const response = await fetch(`${env.apiBase}/api/workspace/projects`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cwd }),
  });
  if (!response.ok) {
    throw new Error(`Registering ${cwd} failed (${response.status}): ${await response.text()}`);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Workbench file-tree rows title themselves with the absolute path (plus a
 * `(<status>)` suffix once git reports the file as changed).
 */
export function fileTreeRow(page: Page, absolutePath: string) {
  // The tree renders `joinPath` output, which normalizes Windows separators.
  const title = absolutePath.replace(/\\/g, "/");
  return page.getByTitle(new RegExp(`^${escapeRegExp(title)}`));
}

/**
 * Create a session through the public API and wait until it appears in the
 * session list (the list is file-backed, so it needs the turn to be persisted).
 */
export async function startSession(prompt = "Playwright fixture session"): Promise<string> {
  const env = readEnvironment();
  const response = await fetch(`${env.apiBase}/api/agent/sessions/new`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cwd: env.workspace, type: "prompt", message: prompt }),
  });
  if (!response.ok) {
    throw new Error(`Creating the E2E session failed (${response.status}): ${await response.text()}`);
  }
  const body = (await response.json()) as { sessionId?: unknown };
  if (typeof body.sessionId !== "string" || body.sessionId === "") {
    throw new Error(`Unexpected session response: ${JSON.stringify(body)}`);
  }
  const sessionId = body.sessionId;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const list = await fetch(`${env.apiBase}/api/agent/sessions`, {
      headers: { "cache-control": "no-cache" },
    });
    if (list.ok) {
      const payload = (await list.json()) as { sessions?: Array<{ id?: unknown }> };
      if (payload.sessions?.some((session) => session.id === sessionId)) return sessionId;
    }
    await delay(250);
  }
  throw new Error(`Session ${sessionId} never appeared in /api/agent/sessions`);
}

/** Create a session and open it in the browser with the workbench ready. */
export async function openSession(page: Page, prompt?: string): Promise<string> {
  const sessionId = await startSession(prompt);
  await page.goto(`/?session=${encodeURIComponent(sessionId)}`);
  // The terminal button stays disabled until the session list supplies the
  // workspace root, so enablement proves the workbench is fully mounted.
  await expect(page.getByTitle("Open terminal")).toBeEnabled();
  return sessionId;
}
