import { expect, test } from "@playwright/test";
import { fileTreeRow, openSession, workspacePath } from "./helpers";

test("sends an inline edit prompt through the active chat session", async ({ page }) => {
  await openSession(page);
  await fileTreeRow(page, workspacePath("src")).click();
  await fileTreeRow(page, workspacePath("src", "app.ts")).click();

  const editor = page.locator(".monaco-editor").first();
  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+K");

  const instruction = page.getByLabel("Inline edit instruction");
  await expect(instruction).toBeVisible();
  await instruction.fill("Rename the constant");
  await instruction.press("Enter");

  const prompt = page.getByText(/Inline edit for/).first();
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText("Rename the constant");
});
