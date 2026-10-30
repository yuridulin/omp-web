import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { fileTreeRow, openSession, workspacePath } from "./helpers";

test.describe.configure({ mode: "serial" });

test("opens a workspace file, edits it in Monaco and saves it with the keyboard", async ({ page }) => {
  const readme = workspacePath("README.md");
  const nextContent = "# E2E README\n\nEdited by the Playwright file spec.\n";

  await openSession(page);
  await fileTreeRow(page, readme).click();

  const editor = page.locator(".monaco-editor").first();
  await expect(editor).toBeVisible();

  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(nextContent);
  await expect(page.getByText("● Unsaved", { exact: true })).toBeVisible();

  await page.keyboard.press("ControlOrMeta+S");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect(page.getByText("● Unsaved", { exact: true })).toBeHidden();

  expect(await readFile(readme, "utf8")).toBe(nextContent);
});
