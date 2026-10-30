import { expect, test } from "@playwright/test";
import { fileTreeRow, openSession, workspacePath } from "./helpers";

test("publishes language-server diagnostics into the Problems view", async ({ page }) => {
  await openSession(page);
  await fileTreeRow(page, workspacePath("src")).click();
  await fileTreeRow(page, workspacePath("src", "app.ts")).click();

  await page.getByRole("button", { name: /^Problems/ }).click();
  await expect(page.getByText("E2E diagnostic")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("src/app.ts", { exact: true })).toBeVisible();
});
