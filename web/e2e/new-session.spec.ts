import { expect, test } from "@playwright/test";
import { readEnvironment, registerProject } from "./helpers";

test("starts an unsaved draft in the first project", async ({ page }) => {
  const env = readEnvironment();
  await registerProject(env.workspace);

  await page.goto("/");

  // Without a selected session the draft must fall back to a real project,
  // not the synthetic ~/omp-cwd-YYYYMMDD directory.
  const rail = page.getByRole("complementary");
  const projectSection = rail.locator("section").filter({
    has: page.getByTitle(env.workspace, { exact: true }),
  });
  await expect(projectSection.getByText("New session", { exact: true })).toBeVisible();
  await expect(rail.getByTitle(/omp-cwd-\d{8}/)).toHaveCount(0);
});
