import { expect, test } from "@playwright/test";
import { readEnvironment } from "./helpers";

test.describe.configure({ mode: "serial" });

test("starts a session from the new-session pane and survives a reload", async ({ page }) => {
  const env = readEnvironment();
  const prompt = "Hello from the E2E suite";
  const reply = `E2E response: ${prompt}`;

  await page.goto("/");
  await page.getByRole("button", { name: "New session" }).click();
  await expect(page.getByRole("heading", { name: "New session" })).toBeVisible();

  await page.getByLabel("Workspace path").fill(env.workspace);
  await page.getByLabel("Message").fill(prompt);
  await page.getByRole("button", { name: "Start session" }).click();

  await expect(page).toHaveURL(/[?&]session=/);
  const sessionId = new URL(page.url()).searchParams.get("session");
  expect(sessionId).toBeTruthy();

  await expect(page.getByText(prompt, { exact: true })).toBeVisible();
  await expect(page.getByText(reply, { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText(reply, { exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("session")).toBe(sessionId);
});
