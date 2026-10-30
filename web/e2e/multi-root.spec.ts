import { expect, test } from "@playwright/test";
import {
  fileTreeRow,
  openSession,
  readEnvironment,
  registerProject,
  workspace2Path,
} from "./helpers";

test("adds a second workspace root and removes it with its tabs", async ({ page }) => {
  const env = readEnvironment();
  await registerProject(env.workspace2);
  await openSession(page);

  await page.getByTitle("Add workspace folder").click();
  await page.getByRole("menuitem", { name: "workspace-2" }).click();

  await expect(page.getByTitle(`Remove ${env.workspace2}`)).toBeVisible();
  await fileTreeRow(page, workspace2Path("README.md")).click();
  await expect(page.getByText("E2E workspace 2").first()).toBeVisible();

  await page.getByTitle(`Remove ${env.workspace2}`).click();
  await expect(page.getByTitle(`Remove ${env.workspace2}`)).toHaveCount(0);
  await expect(fileTreeRow(page, workspace2Path("README.md"))).toHaveCount(0);
});
