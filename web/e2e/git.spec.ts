import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { openSession, readEnvironment, workspacePath } from "./helpers";

test.describe.configure({ mode: "serial" });

test("shows a worktree change, opens the diff, stages and commits it", async ({ page }) => {
  const env = readEnvironment();
  const message = "E2E commit message";
  const readme = workspacePath("README.md");

  await openSession(page);
  await writeFile(readme, "# E2E README\n\nChanged by the Playwright git spec.\n", "utf8");

  await page.getByRole("button", { name: /^Changes/ }).click();
  await page.getByTitle("Refresh git status").click();

  const changeRow = page.getByRole("button", { name: /README\.md/ }).first();
  await expect(changeRow).toBeVisible();
  await changeRow.click();
  await expect(page.locator(".monaco-diff-editor")).toBeVisible();

  await page.getByRole("button", { name: "Stage", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unstage", exact: true })).toBeVisible();

  await page.getByLabel("Commit message").fill(message);
  await page.getByRole("button", { name: "Commit", exact: true }).click();

  await expect(page.getByText("Working tree clean.", { exact: true })).toBeVisible();
  const subject = execFileSync("git", ["log", "-1", "--pretty=%s"], {
    cwd: env.workspace,
    encoding: "utf8",
  }).trim();
  expect(subject).toContain(message);
});
