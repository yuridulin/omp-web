import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const SYSTEM_TABS = ["Settings", "Models", "Providers", "Usage", "Skills", "MCP"] as const;

test("reports the fake model and sends a test notification", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "System settings" }).click();
  const system = page.getByRole("dialog", { name: "System" });
  await expect(system).toBeVisible();
  for (const tab of SYSTEM_TABS) {
    await expect(system.getByRole("tab", { name: tab })).toBeVisible();
  }

  await system.getByRole("tab", { name: "Models" }).click();
  await expect(system.getByText("Fake Model", { exact: true })).toBeVisible();
  await system.getByRole("button", { name: "Close system panel" }).click();
  await expect(system).toBeHidden();

  await page.getByRole("button", { name: /^Notifications/ }).first().click();
  const notifications = page.getByRole("dialog", { name: "Notifications" });
  await expect(notifications).toBeVisible();
  await expect(notifications.getByText("Settings", { exact: true })).toBeVisible();

  await notifications.getByRole("button", { name: "Send test notification" }).click();
  await expect(page.getByText("Notifications are working.", { exact: true })).toBeVisible();
});
