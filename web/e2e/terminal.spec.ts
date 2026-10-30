import { expect, test } from "@playwright/test";
import { openSession } from "./helpers";

test.describe.configure({ mode: "serial" });

test("runs a command in the workspace terminal", async ({ page }) => {
  await openSession(page);

  await page.getByTitle("Open terminal").click();
  await expect(page.locator(".xterm")).toBeVisible();
  await expect(page.getByText(/^pid \d+$/)).toBeVisible();

  await page.locator(".xterm-helper-textarea").focus();
  await page.keyboard.type("echo e2e-terminal");
  await page.keyboard.press("Enter");

  const rows = page.locator(".xterm-rows");
  await expect(rows).toContainText("e2e-terminal");
  // One occurrence is the echoed command line, the second is echo's output.
  await expect
    .poll(async () => (await rows.innerText()).split("e2e-terminal").length - 1)
    .toBeGreaterThanOrEqual(2);
});
