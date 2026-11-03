import { expect, test } from "@playwright/test";
import { readEnvironment } from "./helpers";

test.describe.configure({ mode: "serial" });

test("starts a session from the chat draft and survives a reload", async ({ page }) => {
  const env = readEnvironment();
  const prompt = "Hello from the E2E suite";
  const reply = `E2E response: ${prompt}`;

  await page.goto("/");
  // New sessions start in the normal chat, seeded from the project header.
  const projectRow = page.getByTitle(env.workspace, { exact: true }).locator("..");
  await projectRow.getByRole("button", { name: /^New session in / }).click();
  await expect(page.getByText("No messages yet.")).toBeVisible();

  // The unsaved chat is a row in the rail and the workbench stays open.
  const rail = page.getByRole("complementary");
  await expect(rail.getByText("New session", { exact: true })).toBeVisible();
  await expect(rail.locator('[aria-current="page"]')).toContainText("New session");
  await expect(page.getByTestId("workbench-pane")).toBeVisible();
  await expect(page.getByTitle("Open terminal")).toBeEnabled();

  await page.getByLabel("Message").fill(prompt);
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page).toHaveURL(/[?&]session=/);
  const sessionId = new URL(page.url()).searchParams.get("session");
  expect(sessionId).toBeTruthy();

  await expect(page.getByText(prompt, { exact: true })).toBeVisible();
  await expect(page.getByText(reply, { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText(reply, { exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("session")).toBe(sessionId);
});
