import { expect, test } from "@playwright/test";

/**
 * The System sheet splits a fixed chrome (title, tab row) from one scrolling
 * body. A short viewport with tall tab content used to shrink the tab row
 * instead: its labels were clipped and the panel content painted over them.
 */
const SYSTEM_TABS = ["Settings", "View", "Models", "Providers", "Usage", "Skills", "MCP"] as const;

test("keeps the tab row fully visible above the scrolling body", async ({ page }) => {
  // Small enough that the tab content cannot fit without the body scrolling.
  await page.setViewportSize({ width: 900, height: 460 });
  await page.goto("/");

  await page.getByRole("button", { name: "System settings" }).click();
  const system = page.getByRole("dialog", { name: "System" });
  await expect(system).toBeVisible();

  const tablist = system.getByRole("tablist");
  const body = system.getByRole("tabpanel");

  for (const name of SYSTEM_TABS) {
    const tab = system.getByRole("tab", { name });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");

    // The row must not clip its own labels (`scrollHeight > clientHeight` is
    // exactly what the flex-shrink defect produced: 36px of labels in 26px).
    const clipped = await tablist.evaluate(
      (element) => element.scrollHeight - element.clientHeight,
    );
    expect(clipped, `${name}: tab row clips its labels`).toBeLessThanOrEqual(1);

    const rowBox = await tablist.boundingBox();
    const tabBox = await tab.boundingBox();
    const bodyBox = await body.boundingBox();
    expect(rowBox, `${name}: no tab row box`).not.toBeNull();
    expect(tabBox, `${name}: no tab box`).not.toBeNull();
    expect(bodyBox, `${name}: no body box`).not.toBeNull();
    if (!rowBox || !tabBox || !bodyBox) return;

    // Tall enough for its tallest label, and ending where the body begins.
    expect(tabBox.height, `${name}: tab is taller than the tab row`).toBeLessThanOrEqual(
      rowBox.height,
    );
    expect(
      tabBox.y + tabBox.height,
      `${name}: panel body overlaps the tab`,
    ).toBeLessThanOrEqual(bodyBox.y + 1);
    expect(rowBox.y + rowBox.height, `${name}: tab row overlaps the body`).toBeLessThanOrEqual(
      bodyBox.y + 1,
    );
  }
});
