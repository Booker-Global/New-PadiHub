import { test, expect } from "@playwright/test";

test("homepage loads with no console errors", async ({ page }) => {
  const consoleErrors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto("/");

  // Verify the page loaded successfully
  await expect(page).toHaveTitle(/.*/);

  // Assert no console errors occurred
  expect(consoleErrors).toEqual([]);
});
