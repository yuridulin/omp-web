import { expect, test } from "@playwright/test";
import { readEnvironment, registerProject } from "./helpers";

test("keeps a just-created session in the rail before the polled list carries it", async ({ page }) => {
  const env = readEnvironment();
  await registerProject(env.workspace);

  // omp writes the session file on the first message, so the list can trail a
  // session created a moment ago. Force that gap: every list response is empty.
  let listServed = false;
  await page.route("**/api/agent/sessions", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    listServed = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [], runningSessionIds: [], runningSessions: [] }),
    });
  });

  await page.goto("/");
  await page.getByTitle(env.workspace, { exact: true }).locator("..")
    .getByRole("button", { name: /^New session in / })
    .click();
  await page.getByLabel("Message").fill("Pending rail session");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page).toHaveURL(/[?&]session=/);
  expect(listServed).toBe(true);
  const rail = page.getByRole("complementary");
  await expect(rail.getByText("New session", { exact: true })).toBeVisible();
  await expect(rail.locator('[aria-current="page"]')).toContainText("New session");
});

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
